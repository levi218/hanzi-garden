export interface CharacterComponent {
  part: string; // the component character/radical, e.g. "女"
  pinyin: string; // pinyin of the component, e.g. "nǚ"
  meaning: string; // short gloss, e.g. "woman"
}

export interface CharacterMeaning {
  pos: string; // part of speech, e.g. "adj", "verb", "noun", "particle"
  def: string; // dictionary definition, e.g. "good; well; fine"
}

export interface ExampleWord {
  word: string; // e.g. "你好"
  pinyin: string; // e.g. "nǐ hǎo"
  meaning: string; // e.g. "hello"
}

export interface CharacterEntry {
  char: string; // single hanzi
  pinyin: string; // with tone marks, e.g. "hǎo"
  hsk: 1 | 2 | 3;
  strokes: number;
  radical: string; // main radical, e.g. "女"
  meanings: CharacterMeaning[]; // 1-3 senses, most common first
  components: CharacterComponent[]; // building blocks (1-4)
  compositionNote: string; // one sentence: how the parts build the meaning
  words: ExampleWord[]; // 2-3 common words using this char
  poem: string[]; // 4 short fun mnemonic lines in English
}
