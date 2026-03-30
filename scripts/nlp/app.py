from flask import Flask, request, jsonify
from nltk.corpus import wordnet as wn

app = Flask(__name__)

@app.route('/synonyms', methods=['POST'])
def synonyms():
    data = request.json
    word = data.get('word')
    if not word:
        return jsonify({"error": "No 'word' field provided"}), 400

    synonyms = set()
    for synset in wn.synsets(word, lang='por'):
        for lemma in synset.lemmas('por'):
            synonyms.add(lemma.name())

    return jsonify({
        "word": word,
        "synonyms": list(synonyms)
    })

if __name__ == "__main__":
    app.run(port=5000)