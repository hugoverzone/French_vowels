# data sorting
import csv
import os

from pathlib import Path

root_dir = Path(__file__).resolve().parent

fileLocation = root_dir / 'Lexique400' / 'Lexique4' / 'Lexique4.tsv'

# open tsv  and read data into a dictionary that takes the first column as key and the second and third columns as values in a tupple, skipping the first line of the file

def read_tsv(file_location):
    data = {}
    with open(file_location, 'r', encoding='utf-8') as french_dictionary:
        next(french_dictionary)  # skip the first line
        for line in french_dictionary:
            entry = line.strip().split('\t')
            word_graphemes = entry[0]
            word_phonemes = entry[1]
            word_phonemes_IPA = entry[2]
            type_of_word = entry[5].replace(",", " ")
            value = (word_phonemes, word_phonemes_IPA, type_of_word)
            data[word_graphemes] = value
    return data

# show the first 5 lines of the file
data = read_tsv(fileLocation)

for key, value in list(data.items())[:5]:
    print(key, value)

# write sorted data to csv file
def write_csv(data, filename):
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        for key, value in data.items():
            writer.writerow([key] + list(value))

write_csv(data, 'QUIZ/phonetic_data/lexique_phonetique2.csv')

#list all the unique characters in the strings of values in the second column
phonetic_characters = []
i = 0
for key, value in data.items():
    for index, char in enumerate(value[0]):        
        if char not in [compare_char[0] for compare_char in phonetic_characters]:
            print(i, char, value[1][index])
            phonetic_characters.append([char, value[1][index]])
            i=i+1

print(phonetic_characters)