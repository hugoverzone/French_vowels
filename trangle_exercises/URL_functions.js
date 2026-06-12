const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const BASE45_LOOKUP = new Map([...BASE45_ALPHABET].map((character, index) => [character, index]));

function normalizeIntegerList(values) {
	return [...new Set(
		(values || [])
			.map((value) => Number(value))
			.filter((value) => Number.isInteger(value) && value >= 0)
	)]
		.sort((left, right) => left - right);
}

function toBase45Character(value) {
	return BASE45_ALPHABET[value] || '';
}

function fromBase45Character(character) {
	return BASE45_LOOKUP.get(character) ?? -1;
}

function encodeUnsignedVarint(value) {
	const bytes = [];
	let remaining = value;

	do {
		let byte = remaining & 0x7f;
		remaining = Math.floor(remaining / 128);
		if (remaining > 0) {
			byte |= 0x80;
		}
		bytes.push(byte);
	} while (remaining > 0);

	return bytes;
}

function decodeUnsignedVarint(bytes, startIndex) {
	let value = 0;
	let shift = 0;
	let index = startIndex;

	while (index < bytes.length) {
		const byte = bytes[index];
		value |= (byte & 0x7f) << shift;
		index += 1;

		if ((byte & 0x80) === 0) {
			return { value, nextIndex: index };
		}

		shift += 7;
	}

	return { value: -1, nextIndex: bytes.length };
}

function bytesToBase45(bytes) {
	if (!bytes.length) {
		return '';
	}

	const characters = [];

	for (let index = 0; index < bytes.length; index += 2) {
		const first = bytes[index];
		const second = index + 1 < bytes.length ? bytes[index + 1] : undefined;

		if (second === undefined) {
			const value = first;
			characters.push(toBase45Character(value % 45));
			characters.push(toBase45Character(Math.floor(value / 45)));
			continue;
		}

		const value = first + (second * 256);
		characters.push(toBase45Character(value % 45));
		characters.push(toBase45Character(Math.floor(value / 45) % 45));
		characters.push(toBase45Character(Math.floor(value / 2025)));
	}

	return characters.join('');
}

function base45ToBytes(text) {
	if (!text) {
		return [];
	}

	const characters = String(text).toUpperCase();
	const bytes = [];
	let index = 0;

	while (index < characters.length) {
		const remaining = characters.length - index;

		if (remaining === 1) {
			const first = fromBase45Character(characters[index]);
			if (first < 0) {
				return [];
			}
			bytes.push(first);
			break;
		}

		if (remaining === 2) {
			const first = fromBase45Character(characters[index]);
			const second = fromBase45Character(characters[index + 1]);
			if (first < 0 || second < 0) {
				return [];
			}
			bytes.push(first + (second * 45));
			break;
		}

		const c0 = fromBase45Character(characters[index]);
		const c1 = fromBase45Character(characters[index + 1]);
		const c2 = fromBase45Character(characters[index + 2]);
		if (c0 < 0 || c1 < 0 || c2 < 0) {
			return [];
		}

		const value = c0 + (c1 * 45) + (c2 * 2025);
		bytes.push(value % 256, Math.floor(value / 256));
		index += 3;
	}

	return bytes;
}

export function encodeListToQrString(nums) {
	const sortedValues = normalizeIntegerList(nums);

	if (!sortedValues.length) {
		return '';
	}

	// Stage 1: convert the absolute values into monotonic deltas.
	const bytes = [];
	let previousValue = 0;

	for (const value of sortedValues) {
		const delta = value - previousValue;
		previousValue = value;
		bytes.push(...encodeUnsignedVarint(delta));
	}

	// Stage 2: pack bytes into Base45 characters.
	return bytesToBase45(bytes);
}

export function decodeQrStringToList(encodedStr) {
	if (!encodedStr) {
		return [];
	}

	const token = String(encodedStr).trim().toUpperCase();
	if (!token) {
		return [];
	}

	const bytes = base45ToBytes(token);
	if (!bytes.length) {
		return [];
	}

	const values = [];
	const deltas = [];
	let currentIndex = 0;

	while (currentIndex < bytes.length) {
		const decoded = decodeUnsignedVarint(bytes, currentIndex);
		if (decoded.value < 0) {
			return [];
		}

		deltas.push(decoded.value);
		currentIndex = decoded.nextIndex;
	}

	let runningTotal = 0;
	for (const delta of deltas) {
		runningTotal += delta;
		values.push(runningTotal);
	}

	return values;
}

export function generateQrUrl(token, domain = typeof window !== 'undefined' ? window.location.host : '') {
	const resolvedBaseUrl = String(domain || '').trim() || (typeof window !== 'undefined' ? window.location.href : '');
	const normalizedToken = String(token || '').trim().toUpperCase();

	if (!resolvedBaseUrl) {
		return '';
	}

	const url = new URL(resolvedBaseUrl, typeof window !== 'undefined' ? window.location.href : resolvedBaseUrl);
	url.searchParams.set('TOKEN', normalizedToken);
	return url.toString().toUpperCase();
}

export function extractTokenFromUrl(sourceUrl = typeof window !== 'undefined' ? window.location.href : '') {
	if (!sourceUrl) {
		return '';
	}

	const url = new URL(sourceUrl, sourceUrl);
	const hashToken = url.hash.startsWith('#') ? decodeURIComponent(url.hash.slice(1).trim()) : '';
	if (hashToken) {
		return hashToken.toUpperCase();
	}

	const queryToken = url.searchParams.get('TOKEN') || url.searchParams.get('token');
	const queryValue = queryToken ? queryToken.trim().toUpperCase() : '';
	if (/^[0-9A-Z $%*+\-./:]+$/.test(queryValue)) {
		return queryValue;
	}

	const pathSegments = url.pathname.split('/').filter(Boolean);
	const pathToken = pathSegments[pathSegments.length - 1]?.trim().toUpperCase() || '';
	if (/^[0-9A-Z $%*+\-./:]+$/.test(pathToken)) {
		return pathToken;
	}

	return '';
}

export function encodeRowNumbers(rows) {
	const uniqueRows = [...new Set((rows || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right);

	if (!uniqueRows.length) {
		return '';
	}

	const ranges = [];
	let start = uniqueRows[0];
	let previous = uniqueRows[0];

	for (let index = 1; index < uniqueRows.length; index += 1) {
		const current = uniqueRows[index];
		if (current === previous + 1) {
			previous = current;
			continue;
		}

		ranges.push([start, previous]);
		start = current;
		previous = current;
	}

	ranges.push([start, previous]);

	return ranges
		.map(([rangeStart, rangeEnd]) => (
			rangeStart === rangeEnd
				? rangeStart.toString(36)
				: `${rangeStart.toString(36)}-${rangeEnd.toString(36)}`
		))
		.join('.');
}

export function decodeRowNumbers(payload) {
	if (!payload) {
		return [];
	}

	return payload
		.split('.')
		.filter(Boolean)
		.flatMap((segment) => {
			const [startValue, endValue] = segment.split('-');
			const start = Number.parseInt(startValue, 36);
			const end = endValue ? Number.parseInt(endValue, 36) : start;

			if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
				return [];
			}

			const rows = [];
			for (let current = start; current <= end; current += 1) {
				rows.push(current);
			}
			return rows;
		});
}

export function buildShareUrl(baseUrl, payload, payloadKey = 'rows', fallbackUrl = typeof window !== 'undefined' ? window.location.href : '') {
	const resolvedBaseUrl = baseUrl || fallbackUrl;

	if (!resolvedBaseUrl) {
		return '';
	}

	const url = new URL(resolvedBaseUrl, fallbackUrl || resolvedBaseUrl);
	url.searchParams.set(String(payloadKey || 'TOKEN').toUpperCase(), String(payload || '').toUpperCase());
	return url.toString().toUpperCase();
}

export function getPayloadFromCurrentUrl(sourceUrl = typeof window !== 'undefined' ? window.location.href : '', payloadKey = 'rows') {
	if (!sourceUrl) {
		return '';
	}

	const url = new URL(sourceUrl, sourceUrl);
	const queryPayload = url.searchParams.get(payloadKey);
	if (queryPayload) {
		return queryPayload;
	}

	const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
	return params.get(payloadKey) || '';
}
