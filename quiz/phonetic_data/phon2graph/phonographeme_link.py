import os
import json

from phon2graph_french import decoupage

#paths
class2phoneme_filePath = "quiz/phonetic_data/phon2graph/data/class-phoneme_v2.csv" # phon_e_maj,ɛ
phoneme2grapheme_filePath = "quiz/phonetic_data/phon2graph/data/fidel_wikicolor.scsv" # ɛ:è,ê,e,ei,es,ai

lexique_phonetique_filePath = "quiz/phonetic_data/lexique_phonetique.csv" 



# LECTURE DU DICTIONNAIRE PHONEME-GRAPHIES (FIDEL)
with open(phoneme2grapheme_filePath,mode="r", encoding='utf-8') as fidel:
    phon2graph = {}
    phonCpt = 0

    for line in fidel:
        phonCpt+=1
        line = line.strip()
        l= line.split(':')

        phon2graph[l[0]] = []

        listegraphies = l[1].split(',')
        for graph in listegraphies:
            phon2graph[l[0]].append(graph)

# LECTURE DU DICTIONNAIRE PHONEME-CLASSE
with open(class2phoneme_filePath,mode="r",encoding="utf-8") as phonFile:
    phon2class = {}
    phonCpt = 0
    for line in phonFile:
        line = line.strip()
        l= line.split(',')

        if len(l) == 2:
            phonId,phon = l
            phon2class[phon]=phonId
            phonCpt += 1


with open(lexique_phonetique_filePath,mode="r",encoding="utf-8") as lexique:
    lexique_phonetique = []
    for line in lexique:
        line = line.strip()
        l= line.split(',')
        if len(l) == 4:
            lexique_phonetique.append((l[0], l[1], l[2], l[3]))


i = 0
nbr_fails = 0
fails = []

for word, trans, phon, type in lexique_phonetique:
    i += 1
    decoup = decoupage(word.replace('-', '-'), phon, phon2graph, phon2class)
    if decoup[0][0] == "phon_echec":
        nbr_fails += 1
        fails.append(word)
        continue

    phon_decoupage_str = "|".join([f"{c}" for p, g, c in decoup])
    graph_decoupage_str = "|".join([f"{g}" for p, g, c in decoup])
    print(f"Word: {word}, Transcription: {trans}, Phonemes: {phon}, Type: {type}, Decoupage: {phon_decoupage_str}, Graphies: {graph_decoupage_str}")
    if i >= 10000:  # Limit output for demonstration
        break

print(nbr_fails)

x=0
dash = 0
for fail_word in fails:
    if 'x' in fail_word:
        x += 1
    if '-' in fail_word:
        dash += 1
print(f"Number of failing words containing 'x': {x}")
print(f"Number of failing words containing '-': {dash}")
print(fails)