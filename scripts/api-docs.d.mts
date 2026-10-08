export interface ApiMember {
  name: string;
  type: string;
  required: boolean;
  default: string | null;
  description: string;
  deprecated: string | boolean;
}

export interface ApiExport {
  name: string;
  kind: "component" | "function" | "class" | "type" | "const";
  file: string;
  signature: string;
  description: string;
  deprecated: string | boolean;
  members: ApiMember[];
}

export interface ApiEntry {
  subpath: string;
  importPath: string;
  file: string;
  exports: ApiExport[];
}

export interface MessageRow {
  key: string;
  en: string;
  "zh-TW": string;
}

export interface ApiDocs {
  generatedFrom: "package.json#exports";
  entries: ApiEntry[];
  messages: MessageRow[];
}

export function apiDocs(): Promise<ApiDocs>;
