import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
	{
		ignores: ["main.js", "node_modules/**", "build/**", "*.mjs"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: "./tsconfig.json",
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-explicit-any": "off",

			// The recommended config enables typescript-eslint's strict
			// type-checked rules. The no-unsafe-* family fires on third-party
			// callbacks with untyped signatures (react-select styles) and on
			// Obsidian internal APIs that are absent from the public typings,
			// neither of which can be typed without lying about the shape.
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",

			// KB is a unit; YYYY-MM-DD is a moment.js format token, and the
			// rule splits the sentence on the preceding "e.g." either way.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{ acronyms: ["KB", "YYYY-MM-DD"] },
			],
		},
	},
	{
		// prefer-file-manager-trash-file defers the destination of a deletion
		// to the user's "Deleted files" preference. Janitor asks the user
		// directly instead — the review modal offers Obsidian trash, system
		// trash and permanent delete as separate buttons — and FileProcessor
		// carries out whichever they picked. The rule refuses inline disables,
		// so the exception lives here.
		files: ["src/FileProcessor.ts"],
		rules: {
			"obsidianmd/prefer-file-manager-trash-file": "off",
		},
	},
];
