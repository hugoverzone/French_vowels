# -*- encoding:utf8 -*- 

######### phon2graph_french_v2025.py #########
#
# Python 3.12
#
# Arguments :
#	- input word (mot orthographié)
#	- its IPA transcription
#	- grapheme to phoneme mapping dictionary (Fidel, json format)
#	- phoneme to class mapping dictionary (CSS class for wikicolor display)
#
#	Verbose mode: add verb=True to display details in the console.
#
# Sylvain Coulange (2025)
# cf. README for detailed explanations

import os
import re
import json

# Load phoneme-grapheme positional frequency data (singleton pattern)
_phoneme_grapheme_positional_frequencies = None


def load_positional_frequencies():
    """Load phoneme-grapheme positional frequencies from JSON file (cached)"""
    global _phoneme_grapheme_positional_frequencies
    if _phoneme_grapheme_positional_frequencies is None:
        frequencies_path = os.path.join(os.path.dirname(__file__), 'data', 'phoneme_grapheme_frequencies_positional_LexiqueFr137824.json')
        try:
            with open(frequencies_path, 'r', encoding='utf-8') as f:
                _phoneme_grapheme_positional_frequencies = json.load(f)
        except FileNotFoundError:
            # Fallback: no frequency data available
            _phoneme_grapheme_positional_frequencies = {}
    return _phoneme_grapheme_positional_frequencies

# DECOUPAGE PHONOGRAPHEMIQUE
def decoupage(mot,trans,phon2graph,phon2class,verb=False):

    def printlog(*txt):
        if verb:
            outp = ''
            for i in txt:
                outp += str(i)+' '
            print(outp)
    
    # Load positional frequency data
    positional_frequencies = load_positional_frequencies()
    
    def get_grapheme_cost(phoneme, grapheme, phoneme_idx, total_phonemes):
        """Get cost for a phoneme-grapheme pair based on positional frequency data
        
        Args:
            phoneme: The phoneme being matched
            grapheme: The grapheme candidate
            phoneme_idx: Current phoneme index in the sequence
            total_phonemes: Total number of phonemes in the word
        
        Returns:
            Cost value (lower is better)
        """
        # Determine position
        if phoneme_idx == 0:
            position = 'initial'
        elif phoneme_idx == total_phonemes - 1:
            position = 'final'
        else:
            position = 'medial'
        
        # Try to get position-specific cost
        if (phoneme in positional_frequencies and 
            grapheme in positional_frequencies[phoneme] and
            position in positional_frequencies[phoneme][grapheme]):
            cost = positional_frequencies[phoneme][grapheme][position]['log_prob_cost']
            printlog(f"    Position-specific cost ({position}): {cost}")
            return cost
        else:
            # No positional data: return neutral/high cost
            printlog(f"    No frequency data for /{phoneme}/ → '{grapheme}' at {position} position")
            return 0.5  # Small penalty for unknown combinations

    phonographie = []
    
    # CLEANING TRANSCRIPTION AND WORD
    trans = trans.replace('.','')
    trans = trans.replace('‿','')
    trans = trans.replace(' ','')
    trans = trans.replace('(','')
    trans = trans.replace(')','')
    trans = trans.replace('͡','')
    trans = trans.replace('*','')
    mot = mot.lower()

    # Convert transcription to list of phonemes (multi-character aware)
    # Parse using greedy longest-match from the phon2graph keys
    phonemes = []
    i = 0
    phoneme_set = set(phon2graph.keys())
    
    while i < len(trans):
        # Try longest phonemes first (up to 3 characters for wɛ̃)
        found = False
        for length in range(min(3, len(trans) - i), 0, -1):
            candidate = trans[i:i+length]
            if candidate in phoneme_set:
                phonemes.append(candidate)
                i += length
                found = True
                break
        
        if not found:
            # Unknown phoneme, keep as-is
            printlog(f"Warning: Unknown phoneme '{trans[i]}' at position {i}")
            phonemes.append(trans[i])
            i += 1
    
    n, m = len(mot), len(phonemes)
    
    printlog(f"Word: {mot}, Transcription: {trans}")
    printlog(f"Parsed phonemes: {phonemes}")
    printlog(f"Letters: {n}, Phonemes: {m}")
    
    # Phonemes that PREFER to stay as single units (penalize splitting)
    # e.g., /wa/ in "avoir" → prefer "oi" over "o"+"i"
    prefer_single_phonemes = {
        'wa': ['w', 'a'],      # /wa/ → prefer "oi" (avoir), split only if needed
        'wɑ': ['w', 'ɑ'],      # /wɑ/ → prefer "oi" variant
        'wɛ̃': ['w', 'ɛ̃'],     # /wɛ̃/ → prefer "oin"
    }
    
    # Phonemes that PREFER to be split (bonus for splitting)
    # These are typically analyzed as consonant clusters
    prefer_split_phonemes = {
        'ts': ['t', 's'],      # /ts/ → /t/+/s/ (except Québécois "tsy")
        'dʒ': ['d', 'ʒ'],    # /dʒ/ → /d/+/ʒ/ (for "djihad")
        'ks': ['k', 's'],      # /ks/ → /k/+/s/ (for "excentrique")
        'ij': ['i', 'j'],      # /ij/ → /i/+/j/ (for "fille" ille → i+lle)
        'tʃ': ['t', 'ʃ'],    # /tʃ/ → /t/+/ʃ/ (for "tchador")
        'ɥi': ['ɥ', 'i'],      # /ɥi/ → prefer "u+i" (juillet)
    }
    
    # Phoneme fallback mappings for regional variants
    phoneme_fallbacks = {
        'e': 'ɛ',   # /e/ → /ɛ/ (southern French variants)
        'ɛ': 'e',   # /ɛ/ → /e/ (reverse)
        'o': 'ɔ',   # /o/ → /ɔ/ (e.g., "Drôme" /dʁɔm/)
        'ɔ': 'o',   # /ɔ/ → /o/ (reverse)
        'ø': 'œ',   # /ø/ → /œ/
        'œ': 'ø',   # /œ/ → /ø/
        'ɑ': 'a',   # /ɑ/ → /a/ (e.g., "pâte" /pɑt/)
        'a': 'ɑ',   # /a/ → /ɑ/ (reverse)
    }

    consonants = 'bcçdfghjklmnpqrstvxz'
    vowels = 'aeiouyàâäéèêëïîôùûüÿœæ'
    # Common consonant+h digraphs that should NOT be split
    digraphs_with_h = ['ch', 'ph', 'th', 'sh', 'sch', 'gh', 'rh', 'rrh', 'kh', 'wh', 'dh', 'ddh', 'bh', 'zh']
    
    # Retry mechanism: try up to 3 times with blacklisted choices
    blacklist = set()  # Set of (phoneme_idx, grapheme) tuples to avoid
    max_attempts = 3
    best_result = None
    
    for attempt in range(max_attempts):
        if attempt > 0:
            printlog(f"\n=== RETRY ATTEMPT {attempt + 1} (blacklist: {blacklist}) ===")
        
        # DP table: dp[i][j] = (cost, path) for mot[:i] aligned with phonemes[:j]
        # cost = number of mismatches (lower is better)
        dp = [[None for _ in range(m + 1)] for _ in range(n + 1)]
        dp[0][0] = (0, [])  # Base case: empty alignment
    
        # Fill DP table
        for i in range(n + 1):
            for j in range(m + 1):
                if dp[i][j] is None:
                    continue
                
                current_cost, current_path = dp[i][j]
                
                # Try to consume next phoneme with 1 to 6 letters
                if j < m:
                    original_phoneme = phonemes[j]
                    phonemes_to_try = [original_phoneme]
                    
                    # Add fallback phoneme if available
                    if original_phoneme in phoneme_fallbacks:
                        phonemes_to_try.append(phoneme_fallbacks[original_phoneme])
                    
                    # Try each phoneme variant (original first, then fallback)
                    for phoneme in phonemes_to_try:
                        is_fallback = (phoneme != original_phoneme)
                        
                        # Option 1: Try the phoneme as-is
                        valid_graphemes = phon2graph.get(phoneme, [])
                        
                        if is_fallback and valid_graphemes:
                            printlog(f"Trying fallback: /{original_phoneme}/ → /{phoneme}/")
                        
                        printlog(f"At position ({i},{j}), phoneme /{phoneme}/ can be:", valid_graphemes)
                        
                        # Filter valid graphemes based on context
                        filtered_graphemes = []
                        for graph in valid_graphemes:
                            grapheme_end_pos = i + len(graph)
                            if grapheme_end_pos > n:
                                continue  # Grapheme too long for remaining word
                            
                            word_slice = mot[i:grapheme_end_pos]
                            if word_slice != graph:
                                continue  # Grapheme doesn't match word at this position
                            
                            # Exception: Skip graphemes starting with 'h' if it can attach to previous CONSONANT
                            # (e.g., prefer "th" for /t/ over "t" + "hé" for /e/)
                            # But allow "hé" after vowels (e.g., "cohérent" → o,hé not oh,é)
                            skip = False
                            
                            # Rule 1: Skip graphemes starting with 'h' after vowels (prefer h+vowel)
                            if graph.startswith('h') and i > 0:
                                # Check what letter precedes the 'h' in the word
                                prev_char = mot[i-1]
                                # Only attach h to previous letter if it's a consonant
                                if prev_char in consonants and j > 0 and len(current_path) > 0:
                                    prev_phoneme = phonemes[j-1]
                                    prev_graphemes = phon2graph.get(prev_phoneme, [])
                                    # Check if there's a grapheme like "th", "ph", "ch" for the previous phoneme
                                    for alt_graph in prev_graphemes:
                                        if alt_graph == prev_char + 'h':
                                            # The previous phoneme can absorb this 'h'
                                            printlog(f"  Skipping '{graph}' (h should attach to previous consonant '{prev_char}')")
                                            skip = True
                                            break
                            
                            # Rule 2: Skip graphemes ending with 'h' if followed by a vowel (prefer h+vowel)
                            # EXCEPT for well-known consonant+h digraphs like "ch", "th", "ph"
                            # (e.g., "brouhaha" → prefer "ou"+"ha"+"ha" over "ouh"+"a"+"ha")
                            # but allow "chute" → "ch"+"u"+"te"
                            if not skip and graph.endswith('h') and graph not in digraphs_with_h and grapheme_end_pos < n:
                                next_char = mot[grapheme_end_pos]
                                if next_char in vowels or next_char == 'h':
                                    # The 'h' should start the next grapheme with the vowel
                                    printlog(f"  Skipping '{graph}' (h should start next grapheme with '{next_char}')")
                                    skip = True
                            
                            if not skip:
                                filtered_graphemes.append(graph)
                        
                        printlog(f"  Filtered graphemes: {filtered_graphemes}")
                        
                        # Try different grapheme lengths (prefer longer graphemes)
                        for graph in filtered_graphemes:
                            # Skip if this choice is blacklisted from previous attempt
                            if (j, graph) in blacklist:
                                printlog(f"  Skipping blacklisted: '{graph}' → /{phoneme}/")
                                continue
                            
                            length = len(graph)
                            
                            # Calculate cost using positional frequency-based model
                            # 1. Get position-specific frequency cost
                            grapheme_cost = get_grapheme_cost(phoneme, graph, j, m)
                            
                            # 2. Fallback penalty (using non-standard phoneme variant)
                            fallback_penalty = 0.05 if is_fallback else 0
                            
                            # 3. Small length bonus to break ties (prefer longer graphemes)
                            length_bonus = -(length * 0.005)
                            
                            new_cost = current_cost + grapheme_cost + fallback_penalty + length_bonus
                            # Always store the ORIGINAL phoneme in the path, not the fallback
                            new_path = current_path + [(original_phoneme, graph)]
                            
                            printlog(f"  → Match: '{graph}' → /{phoneme}/ (cost: {new_cost})")
                            
                            # Update DP table if this is better (lower cost) - with bounds check
                            if i+length <= n and j+1 <= m:
                                if dp[i+length][j+1] is None or dp[i+length][j+1][0] > new_cost:
                                    dp[i+length][j+1] = (new_cost, new_path)
                    
                    # Option 2: If phoneme is splittable, try split version
                    phoneme = original_phoneme  # Reset to original for split check
                    
                    # Check which category this phoneme belongs to
                    split_parts = None
                    split_cost_modifier = 0
                    
                    if phoneme in prefer_single_phonemes:
                        split_parts = prefer_single_phonemes[phoneme]
                        split_cost_modifier = +0.15  # Penalty: prefer keeping as single unit
                        printlog(f"  Trying split (penalized): /{phoneme}/ → {split_parts}")
                    elif phoneme in prefer_split_phonemes:
                        split_parts = prefer_split_phonemes[phoneme]
                        split_cost_modifier = -0.10  # Bonus: prefer splitting
                        printlog(f"  Trying split (preferred): /{phoneme}/ → {split_parts}")
                    
                    if split_parts and j + 1 <= m:
                        
                        # Try to match the split parts sequentially
                        # This creates a path where we consume one phoneme but produce multiple sub-phonemes
                        # We need to try aligning split_parts starting from position i
                        
                        # Start a mini-DP for the split
                        # split_dp[k][p] = best cost/path for mot[i:i+k] aligned with split_parts[:p]
                        n_split = n - i
                        m_split = len(split_parts)
                        split_dp = [[None for _ in range(m_split + 1)] for _ in range(n_split + 1)]
                        split_dp[0][0] = (0, [])
                        
                        for k in range(n_split + 1):
                            for p in range(m_split + 1):
                                if split_dp[k][p] is None:
                                    continue
                                
                                split_cost, split_path = split_dp[k][p]
                                
                                if p < m_split:
                                    sub_phoneme = split_parts[p]
                                    sub_graphemes = phon2graph.get(sub_phoneme, [])
                                    
                                    for sub_graph in sub_graphemes:
                                        sub_len = len(sub_graph)
                                        if k + sub_len <= n_split and mot[i+k:i+k+sub_len] == sub_graph:
                                            sub_new_cost = split_cost
                                            sub_new_path = split_path + [(sub_phoneme, sub_graph)]
                                            
                                            if split_dp[k+sub_len][p+1] is None or split_dp[k+sub_len][p+1][0] > sub_new_cost:
                                                split_dp[k+sub_len][p+1] = (sub_new_cost, sub_new_path)
                        
                        # Check if we successfully matched all split parts
                        for k in range(n_split + 1):
                            if split_dp[k][m_split] is not None:
                                split_final_cost, split_final_path = split_dp[k][m_split]
                                # Apply cost modifier based on phoneme category
                                new_cost = current_cost + split_final_cost + split_cost_modifier
                                new_path = current_path + split_final_path
                                
                                printlog(f"  → Split match: {split_final_path} (cost: {new_cost})")
                                
                                # Update DP with bounds check
                                if i+k <= n and j+1 <= m:
                                    if dp[i+k][j+1] is None or dp[i+k][j+1][0] > new_cost:
                                        dp[i+k][j+1] = (new_cost, new_path)
                
                # Handle silent letters at the end (optional)
                if j == m and i < n:
                    # Remaining letters are silent
                    silent_letters = mot[i:]
                    # Strong penalty for leaving letters uncovered (10 per letter)
                    # This ensures complete alignments are always preferred
                    num_silent = len(silent_letters)
                    new_cost = current_cost + (num_silent * 10.0)
                    new_path = current_path + [("", silent_letters)]
                    
                    if dp[n][m] is None or dp[n][m][0] > new_cost:
                        dp[n][m] = (new_cost, new_path)
    
        # Extract result from this attempt
        if dp[n][m] is not None:
            cost, path = dp[n][m]
            printlog(f"Attempt {attempt + 1} - Found alignment with cost: {cost}")
            
            # Check if we covered all letters of the word (excluding silent letter markers)
            total_grapheme_length = sum(len(grapheme) for phoneme, grapheme in path if phoneme)
            
            # Accept ANY complete alignment (all letters covered), regardless of cost
            # High cost just means rare/unseen combinations, but structure is valid
            # Only retry for PARTIAL alignments
            if total_grapheme_length == n:
                # Complete alignment - success!
                printlog(f"Complete alignment found! (cost: {cost})")
                for phoneme, grapheme in path:
                    if phoneme:  # Skip silent letters
                        phon_class = phon2class.get(phoneme, "unknown")
                        phonographie.append((phon_class, grapheme, phoneme))
                        printlog(f"  '{grapheme}' → /{phoneme}/ [{phon_class}]")
                break  # Success - exit retry loop
            else:
                # Partial alignment - save as best result and prepare for retry
                printlog(f"Partial alignment! Covered {total_grapheme_length}/{n} letters, cost={cost}")
                if best_result is None or (total_grapheme_length > best_result[1] or (total_grapheme_length == best_result[1] and cost < best_result[2])):
                    best_result = (path, total_grapheme_length, cost)
                
                # Blacklist strategy: find highest-frequency short grapheme to try alternatives
                if attempt < max_attempts - 1:
                    candidates_for_blacklist = []
                    for idx, (phoneme, grapheme) in enumerate(path):
                        if phoneme and len(grapheme) <= 2:  # Focus on short graphemes
                            # Get cost (more negative = higher frequency)
                            g_cost = get_grapheme_cost(phoneme, grapheme, idx, m)
                            candidates_for_blacklist.append((g_cost, idx, grapheme))
                    
                    # Sort by cost (most negative first = highest frequency)
                    candidates_for_blacklist.sort()
                    
                    # Blacklist the most frequent one
                    if candidates_for_blacklist:
                        _, idx_to_blacklist, graph_to_blacklist = candidates_for_blacklist[0]
                        blacklist.add((idx_to_blacklist, graph_to_blacklist))
                        printlog(f"Blacklisting: phoneme#{idx_to_blacklist} '{graph_to_blacklist}'")
        else:
            printlog(f"Attempt {attempt + 1} - No alignment found")
    
    # After all attempts, use best partial result if no complete alignment found
    if not phonographie:
        if best_result:
            printlog(f"Using best partial result: {best_result[1]}/{n} letters covered")
            phonographie = [("phon_echec", mot, "")]
        else:
            printlog("All attempts failed - returning word as phon_echec")
            phonographie = [("phon_echec", mot, "")]
    return phonographie # list of tuples [ (phonemeClass, grapheme, phonemeIPA), ... ]

