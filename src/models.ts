export interface Style {
    color: string | undefined;
    opacity: number | undefined;
}

export interface MultilineRule {
    endRule: string;
    startRule: string;
    style: Style | undefined;
}

export interface OnelineRule {
    rule: string;
    style: Style | undefined;
}

export type Rule = MultilineRule | OnelineRule;

export interface Config {
    rules: [Rule] | undefined;
    style: Style | undefined;
}
