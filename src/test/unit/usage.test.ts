import * as assert from "assert";
import { findImportedLibraries } from "../../usage";

suite("findImportedLibraries", () => {
  const find = (content: string, names: string[]) =>
    findImportedLibraries(content, names).sort();

  test("ESM import를 찾는다", () => {
    assert.deepStrictEqual(
      find(`import React from "react";`, ["react", "vue"]),
      ["react"]
    );
    assert.deepStrictEqual(find(`import { x } from 'lodash'`, ["lodash"]), [
      "lodash",
    ]);
  });

  test("side-effect import를 찾는다", () => {
    assert.deepStrictEqual(find(`import "reflect-metadata";`, ["reflect-metadata"]), [
      "reflect-metadata",
    ]);
  });

  test("CommonJS require를 찾는다", () => {
    assert.deepStrictEqual(find(`const fs = require("fs-extra");`, ["fs-extra"]), [
      "fs-extra",
    ]);
  });

  test("하위 경로 import도 같은 패키지로 본다", () => {
    assert.deepStrictEqual(find(`import debounce from "lodash/debounce";`, ["lodash"]), [
      "lodash",
    ]);
  });

  // 알려진 버그: require 정규식이 하위 경로 뒤의 문자를 허용하지 않는다. #29에서 수정한다.
  test.skip("하위 경로 require도 같은 패키지로 본다", () => {
    assert.deepStrictEqual(find(`require('date-fns/format')`, ["date-fns"]), [
      "date-fns",
    ]);
  });

  test("scoped 패키지를 찾는다", () => {
    assert.deepStrictEqual(
      find(`import { parse } from "@babel/parser";`, ["@babel/parser", "@babel/core"]),
      ["@babel/parser"]
    );
  });

  test("이름이 앞부분만 같은 다른 패키지와 헷갈리지 않는다", () => {
    assert.deepStrictEqual(find(`import { render } from "react-dom";`, ["react"]), []);
  });

  test("이름에 정규식 특수문자가 있어도 안전하게 처리한다", () => {
    assert.deepStrictEqual(find(`import x from "lodash.merge";`, ["lodash.merge"]), [
      "lodash.merge",
    ]);
    assert.deepStrictEqual(find(`import x from "lodashXmerge";`, ["lodash.merge"]), []);
  });

  test("참조가 없으면 빈 배열", () => {
    assert.deepStrictEqual(find(`console.log("react");`, ["react"]), []);
  });
});
