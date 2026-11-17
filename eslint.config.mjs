import nx from "@nx/eslint-plugin";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
        ignores: [
            "**/dist",
            "**/out-tsc"
        ]
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: true,
                    allow: [
                        "^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"
                    ],
                    depConstraints: [
                        { sourceTag: "scope:app", onlyDependOnLibsWithTags: ["*"] },
                        { sourceTag: "scope:agents", onlyDependOnLibsWithTags: ["scope:agents", "scope:shared"] },
                        { sourceTag: "scope:conversations", onlyDependOnLibsWithTags: ["scope:conversations", "scope:shared"] },
                        { sourceTag: "scope:shared", onlyDependOnLibsWithTags: ["scope:shared"] },
                        { sourceTag: "layer:domain", onlyDependOnLibsWithTags: ["layer:domain"] },
                        { sourceTag: "layer:application", onlyDependOnLibsWithTags: ["layer:domain", "layer:application"] },
                        { sourceTag: "layer:infra", onlyDependOnLibsWithTags: ["layer:domain", "layer:application", "layer:infra"] },
                        { sourceTag: "layer:presentation", onlyDependOnLibsWithTags: ["*"] }
                    ]
                }
            ]
        }
    },
    {
        // Domain and application layers must stay framework/database free
        files: ["packages/*/domain/**/*.ts", "packages/*/application/**/*.ts"],
        rules: {
            "no-restricted-imports": ["error", { patterns: ["@nestjs/*", "mongodb", "mongoose"] }]
        }
    },
    {
        files: ["**/*.ts"],
        rules: { "@typescript-eslint/no-explicit-any": "error" }
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.cts",
            "**/*.mts",
            "**/*.js",
            "**/*.jsx",
            "**/*.cjs",
            "**/*.mjs"
        ],
        // Override or add rules here
        rules: {}
    }
];
