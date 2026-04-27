declare module "latex.js" {
  export class HtmlGenerator {
    constructor(options?: { hyphenate?: boolean; documentClass?: string });
    domFragment(): DocumentFragment;
    stylesAndScripts(baseURL: string): DocumentFragment;
    htmlDocument(baseURL?: string): Document;
  }

  export function parse(latex: string, options: { generator: HtmlGenerator }): HtmlGenerator;
}
