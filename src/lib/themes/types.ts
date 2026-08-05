export interface UIColors {
  bgPrimary: string;
  bgSecondary: string;
  bgHover: string;
  textNormal: string;
  textMuted: string;
  borderDivider: string;
  interactiveAccent: string;
  selectionBg: string;
  headerBg: string;
  codeBg: string;
  codeInlineBg: string;
  codeInlineColor: string;
  tableBorder: string;
  tableHeaderBg: string;
  tableHeaderFg: string;
  tableRowBg: string;
  tableRowStripe: string;
  alertNoteBorder: string;
  alertNoteBg: string;
  alertTipBorder: string;
  alertTipBg: string;
  alertImportantBorder: string;
  alertImportantBg: string;
  alertWarningBorder: string;
  alertWarningBg: string;
  alertCautionBorder: string;
  alertCautionBg: string;
}

export interface UITheme {
  id: "light" | "dark";
  mode: "light" | "dark";
  colors: UIColors;
}

export interface PreviewColors {
  bgPrimary: string;
  textColor: string;
  headingColor: string;
  linkColor: string;
  linkHoverColor: string;
  blockquoteBorder: string;
  blockquoteBg: string;
  codeKeyword: string;
  codeString: string;
  codeNumber: string;
  codeComment: string;
  codeFunction: string;
  codeBuiltin: string;
  codeVariable: string;
  codeAttr: string;
  codeTag: string;
  tableBorder: string;
  tableHeaderBg: string;
  tableRowStripe: string;
}

export interface PreviewTheme {
  id: string;
  label: string;
  mode: "light" | "dark";
  colors: PreviewColors;
}
