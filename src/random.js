export class SchemaDeck {
  constructor(random = Math.random) {
    this.random = random;
    this.signature = "";
    this.bag = [];
    this.last = null;
  }
  draw(schemas) {
    if (!schemas.length) throw Error("В библиотеке нет схем");
    const signature = schemas
      .map((s) => s.id)
      .sort()
      .join("|");
    if (signature !== this.signature) {
      this.signature = signature;
      this.bag = [];
    }
    if (!this.bag.length) {
      this.bag = schemas.map((s) => s.id);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag.at(-1) === this.last)
        [this.bag[0], this.bag[this.bag.length - 1]] = [
          this.bag.at(-1),
          this.bag[0],
        ];
    }
    this.last = this.bag.pop();
    return schemas.find((s) => s.id === this.last);
  }
}
