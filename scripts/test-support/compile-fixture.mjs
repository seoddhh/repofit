import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

export function writeFixture(root, file, contents) {
  const output = join(root, file);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
}

// Preserve source directories so regression checks exercise the real relative
// imports. Only the application alias and explicit platform mocks are replaced.
export function createFixtureCompiler(root) {
  return (source, target = source.replace(/\.tsx?$/, '.js'), transform = value => value) => {
    const code = ts.transpileModule(transform(readFileSync(source, 'utf8')), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
      },
    }).outputText.replace(/require\(["']@\/([^"']+)["']\)/g, (_, path) => {
      const resolved = relative(dirname(target), path).replaceAll('\\', '/');
      return `require(${JSON.stringify(resolved.startsWith('.') ? resolved : `./${resolved}`)})`;
    });
    writeFixture(root, target, code);
  };
}
