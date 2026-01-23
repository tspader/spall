// Tree-sitter parser configuration
// WASM binaries from tree-sitter-wasms package
// Highlight queries bundled locally

// WASM imports
import bash_wasm from "tree-sitter-wasms/out/tree-sitter-bash.wasm" with { type: "file" };
import c_wasm from "tree-sitter-wasms/out/tree-sitter-c.wasm" with { type: "file" };
import cpp_wasm from "tree-sitter-wasms/out/tree-sitter-cpp.wasm" with { type: "file" };
import c_sharp_wasm from "tree-sitter-wasms/out/tree-sitter-c_sharp.wasm" with { type: "file" };
import css_wasm from "tree-sitter-wasms/out/tree-sitter-css.wasm" with { type: "file" };
import dart_wasm from "tree-sitter-wasms/out/tree-sitter-dart.wasm" with { type: "file" };
import elisp_wasm from "tree-sitter-wasms/out/tree-sitter-elisp.wasm" with { type: "file" };
import elixir_wasm from "tree-sitter-wasms/out/tree-sitter-elixir.wasm" with { type: "file" };
import elm_wasm from "tree-sitter-wasms/out/tree-sitter-elm.wasm" with { type: "file" };
import embedded_template_wasm from "tree-sitter-wasms/out/tree-sitter-embedded_template.wasm" with { type: "file" };
import go_wasm from "tree-sitter-wasms/out/tree-sitter-go.wasm" with { type: "file" };
import html_wasm from "tree-sitter-wasms/out/tree-sitter-html.wasm" with { type: "file" };
import java_wasm from "tree-sitter-wasms/out/tree-sitter-java.wasm" with { type: "file" };
import javascript_wasm from "tree-sitter-wasms/out/tree-sitter-javascript.wasm" with { type: "file" };
import json_wasm from "tree-sitter-wasms/out/tree-sitter-json.wasm" with { type: "file" };
import kotlin_wasm from "tree-sitter-wasms/out/tree-sitter-kotlin.wasm" with { type: "file" };
import lua_wasm from "tree-sitter-wasms/out/tree-sitter-lua.wasm" with { type: "file" };
import objc_wasm from "tree-sitter-wasms/out/tree-sitter-objc.wasm" with { type: "file" };
import ocaml_wasm from "tree-sitter-wasms/out/tree-sitter-ocaml.wasm" with { type: "file" };
import php_wasm from "tree-sitter-wasms/out/tree-sitter-php.wasm" with { type: "file" };
import python_wasm from "tree-sitter-wasms/out/tree-sitter-python.wasm" with { type: "file" };
import ql_wasm from "tree-sitter-wasms/out/tree-sitter-ql.wasm" with { type: "file" };
import rescript_wasm from "tree-sitter-wasms/out/tree-sitter-rescript.wasm" with { type: "file" };
import ruby_wasm from "tree-sitter-wasms/out/tree-sitter-ruby.wasm" with { type: "file" };
import rust_wasm from "tree-sitter-wasms/out/tree-sitter-rust.wasm" with { type: "file" };
import scala_wasm from "tree-sitter-wasms/out/tree-sitter-scala.wasm" with { type: "file" };
import solidity_wasm from "tree-sitter-wasms/out/tree-sitter-solidity.wasm" with { type: "file" };
import swift_wasm from "tree-sitter-wasms/out/tree-sitter-swift.wasm" with { type: "file" };
import systemrdl_wasm from "tree-sitter-wasms/out/tree-sitter-systemrdl.wasm" with { type: "file" };
import tlaplus_wasm from "tree-sitter-wasms/out/tree-sitter-tlaplus.wasm" with { type: "file" };
import toml_wasm from "tree-sitter-wasms/out/tree-sitter-toml.wasm" with { type: "file" };
import tsx_wasm from "tree-sitter-wasms/out/tree-sitter-tsx.wasm" with { type: "file" };
import typescript_wasm from "tree-sitter-wasms/out/tree-sitter-typescript.wasm" with { type: "file" };
import vue_wasm from "tree-sitter-wasms/out/tree-sitter-vue.wasm" with { type: "file" };
import yaml_wasm from "tree-sitter-wasms/out/tree-sitter-yaml.wasm" with { type: "file" };
import zig_wasm from "tree-sitter-wasms/out/tree-sitter-zig.wasm" with { type: "file" };

// Query imports
import bash_highlights from "./queries/bash.scm" with { type: "file" };
import c_highlights from "./queries/c.scm" with { type: "file" };
import cpp_highlights from "./queries/cpp.scm" with { type: "file" };
import c_sharp_highlights from "./queries/c_sharp.scm" with { type: "file" };
import css_highlights from "./queries/css.scm" with { type: "file" };
import dart_highlights from "./queries/dart.scm" with { type: "file" };
import elisp_highlights from "./queries/elisp.scm" with { type: "file" };
import elixir_highlights from "./queries/elixir.scm" with { type: "file" };
import elm_highlights from "./queries/elm.scm" with { type: "file" };
import embedded_template_highlights from "./queries/embedded_template.scm" with { type: "file" };
import go_highlights from "./queries/go.scm" with { type: "file" };
import html_highlights from "./queries/html.scm" with { type: "file" };
import java_highlights from "./queries/java.scm" with { type: "file" };
import javascript_highlights from "./queries/javascript.scm" with { type: "file" };
import json_highlights from "./queries/json.scm" with { type: "file" };
import kotlin_highlights from "./queries/kotlin.scm" with { type: "file" };
import lua_highlights from "./queries/lua.scm" with { type: "file" };
import objc_highlights from "./queries/objc.scm" with { type: "file" };
import ocaml_highlights from "./queries/ocaml.scm" with { type: "file" };
import php_highlights from "./queries/php.scm" with { type: "file" };
import python_highlights from "./queries/python.scm" with { type: "file" };
import ql_highlights from "./queries/ql.scm" with { type: "file" };
import rescript_highlights from "./queries/rescript.scm" with { type: "file" };
import ruby_highlights from "./queries/ruby.scm" with { type: "file" };
import rust_highlights from "./queries/rust.scm" with { type: "file" };
import scala_highlights from "./queries/scala.scm" with { type: "file" };
import solidity_highlights from "./queries/solidity.scm" with { type: "file" };
import swift_highlights from "./queries/swift.scm" with { type: "file" };
import systemrdl_highlights from "./queries/systemrdl.scm" with { type: "file" };
import tlaplus_highlights from "./queries/tlaplus.scm" with { type: "file" };
import toml_highlights from "./queries/toml.scm" with { type: "file" };
import tsx_highlights from "./queries/tsx.scm" with { type: "file" };
import typescript_highlights from "./queries/typescript.scm" with { type: "file" };
import vue_highlights from "./queries/vue.scm" with { type: "file" };
import yaml_highlights from "./queries/yaml.scm" with { type: "file" };
import zig_highlights from "./queries/zig.scm" with { type: "file" };

export const parsers = [
  {
    filetype: "bash",
    wasm: bash_wasm,
    queries: { highlights: [bash_highlights] },
  },
  { filetype: "c", wasm: c_wasm, queries: { highlights: [c_highlights] } },
  {
    filetype: "cpp",
    wasm: cpp_wasm,
    queries: { highlights: [cpp_highlights] },
  },
  {
    filetype: "c_sharp",
    wasm: c_sharp_wasm,
    queries: { highlights: [c_sharp_highlights] },
  },
  {
    filetype: "css",
    wasm: css_wasm,
    queries: { highlights: [css_highlights] },
  },
  {
    filetype: "dart",
    wasm: dart_wasm,
    queries: { highlights: [dart_highlights] },
  },
  {
    filetype: "elisp",
    wasm: elisp_wasm,
    queries: { highlights: [elisp_highlights] },
  },
  {
    filetype: "elixir",
    wasm: elixir_wasm,
    queries: { highlights: [elixir_highlights] },
  },
  {
    filetype: "elm",
    wasm: elm_wasm,
    queries: { highlights: [elm_highlights] },
  },
  {
    filetype: "embedded_template",
    wasm: embedded_template_wasm,
    queries: { highlights: [embedded_template_highlights] },
  },
  { filetype: "go", wasm: go_wasm, queries: { highlights: [go_highlights] } },
  {
    filetype: "html",
    wasm: html_wasm,
    queries: { highlights: [html_highlights] },
  },
  {
    filetype: "java",
    wasm: java_wasm,
    queries: { highlights: [java_highlights] },
  },
  {
    filetype: "javascript",
    wasm: javascript_wasm,
    queries: { highlights: [javascript_highlights] },
  },
  {
    filetype: "json",
    wasm: json_wasm,
    queries: { highlights: [json_highlights] },
  },
  {
    filetype: "kotlin",
    wasm: kotlin_wasm,
    queries: { highlights: [kotlin_highlights] },
  },
  {
    filetype: "lua",
    wasm: lua_wasm,
    queries: { highlights: [lua_highlights] },
  },
  {
    filetype: "objc",
    wasm: objc_wasm,
    queries: { highlights: [objc_highlights] },
  },
  {
    filetype: "ocaml",
    wasm: ocaml_wasm,
    queries: { highlights: [ocaml_highlights] },
  },
  {
    filetype: "php",
    wasm: php_wasm,
    queries: { highlights: [php_highlights] },
  },
  {
    filetype: "python",
    wasm: python_wasm,
    queries: { highlights: [python_highlights] },
  },
  { filetype: "ql", wasm: ql_wasm, queries: { highlights: [ql_highlights] } },
  {
    filetype: "rescript",
    wasm: rescript_wasm,
    queries: { highlights: [rescript_highlights] },
  },
  {
    filetype: "ruby",
    wasm: ruby_wasm,
    queries: { highlights: [ruby_highlights] },
  },
  {
    filetype: "rust",
    wasm: rust_wasm,
    queries: { highlights: [rust_highlights] },
  },
  {
    filetype: "scala",
    wasm: scala_wasm,
    queries: { highlights: [scala_highlights] },
  },
  {
    filetype: "solidity",
    wasm: solidity_wasm,
    queries: { highlights: [solidity_highlights] },
  },
  {
    filetype: "swift",
    wasm: swift_wasm,
    queries: { highlights: [swift_highlights] },
  },
  {
    filetype: "systemrdl",
    wasm: systemrdl_wasm,
    queries: { highlights: [systemrdl_highlights] },
  },
  {
    filetype: "tlaplus",
    wasm: tlaplus_wasm,
    queries: { highlights: [tlaplus_highlights] },
  },
  {
    filetype: "toml",
    wasm: toml_wasm,
    queries: { highlights: [toml_highlights] },
  },
  {
    filetype: "tsx",
    wasm: tsx_wasm,
    queries: { highlights: [tsx_highlights] },
  },
  {
    filetype: "typescript",
    wasm: typescript_wasm,
    queries: { highlights: [typescript_highlights] },
  },
  {
    filetype: "vue",
    wasm: vue_wasm,
    queries: { highlights: [vue_highlights] },
  },
  {
    filetype: "yaml",
    wasm: yaml_wasm,
    queries: { highlights: [yaml_highlights] },
  },
  {
    filetype: "zig",
    wasm: zig_wasm,
    queries: { highlights: [zig_highlights] },
  },
];
