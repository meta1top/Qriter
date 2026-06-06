import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/libs", "<rootDir>/apps", "<rootDir>/scripts"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  // 排除 libs/agent（用 vitest）和 packages/*（前端，不在 jest 范围）
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "<rootDir>/libs/agent/",
    "<rootDir>/packages/",
  ],
  moduleNameMapper: {
    "^@qriter/shared$": "<rootDir>/libs/shared/src",
    "^@qriter/shared/(.*)$": "<rootDir>/libs/shared/src/$1",
    "^@qriter/common$": "<rootDir>/libs/common/src",
    "^@qriter/common/(.*)$": "<rootDir>/libs/common/src/$1",
    "^@qriter/types$": "<rootDir>/libs/types/src",
    "^@qriter/types/(.*)$": "<rootDir>/libs/types/src/$1",
    "^@qriter/account$": "<rootDir>/libs/account/src",
    "^@qriter/account/(.*)$": "<rootDir>/libs/account/src/$1",
    "^@qriter/book$": "<rootDir>/libs/book/src",
    "^@qriter/book/(.*)$": "<rootDir>/libs/book/src/$1",
    "^@qriter/agent$": "<rootDir>/libs/agent/src",
    "^@qriter/agent/(.*)$": "<rootDir>/libs/agent/src/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.base.json",
      },
    ],
  },
  // 默认 5s 超时；事务测试可能更慢
  testTimeout: 15_000,
};

export default config;
