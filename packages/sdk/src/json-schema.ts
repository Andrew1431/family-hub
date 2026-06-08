/**
 * Minimal JSON Schema subset shared by capability input schemas.
 * Deliberately small: this is the common ground between an Anthropic
 * tool `input_schema` and an MCP tool `inputSchema`, which are identical.
 */
export interface JSONSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  description?: string;
  enum?: readonly (string | number | boolean | null)[];
  properties?: Record<string, JSONSchema>;
  required?: readonly string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  default?: unknown;
  [key: string]: unknown;
}
