/** Whitelisted AST interpreter: no eval, globals, assignments, or property access. */
import { parseExpressionAt } from 'acorn';
/** @typedef {import('./value.js').Value} Value */
/** @typedef {Record<string, Value | ((...args:Value[])=>Value)>} Context */
const binary = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '<',
  '<=',
  '>',
  '>=',
  '===',
  '!==',
  '==',
  '!=',
]);
const logical = new Set(['&&', '||', '??']);
/** @param {string} source */
export function compileExpression(source) {
  if (source.length > 32768) throw new Error('expression exceeds 32768 characters');
  const ast = parseExpressionAt(source, 0, { ecmaVersion: 2022 });
  if (source.slice(ast.end).trim()) throw new Error('only a single expression is allowed');
  /** @type {Set<string>} */ const names = new Set();
  /** @type {Array<{name:string,args:Value[]}>} */ const calls = [];
  let nodes = 0;
  /** @param {any} n */
  const check = (n) => {
    if (++nodes > 2048) throw new Error('expression exceeds AST budget');
    switch (n.type) {
      case 'Literal':
        if (!['number', 'string', 'boolean'].includes(typeof n.value))
          throw new Error('invalid literal');
        break;
      case 'Identifier':
        names.add(n.name);
        break;
      case 'MemberExpression': {
        if (n.optional || (n.computed && n.property.type !== 'Literal'))
          throw new Error('only literal data fields are allowed');
        const field = n.computed ? n.property.value : n.property.name;
        if (['__proto__', 'prototype', 'constructor'].includes(String(field)))
          throw new Error('forbidden data field');
        check(n.object);
        break;
      }
      case 'ArrayExpression':
        for (const e of n.elements) {
          if (!e) throw new Error('array holes forbidden');
          check(e);
        }
        break;
      case 'UnaryExpression':
        if (!['+', '-', '!'].includes(n.operator)) throw new Error('invalid unary operator');
        check(n.argument);
        break;
      case 'BinaryExpression':
      case 'LogicalExpression':
        if (!(n.type === 'BinaryExpression' ? binary : logical).has(n.operator))
          throw new Error('invalid operator');
        check(n.left);
        check(n.right);
        break;
      case 'ConditionalExpression':
        check(n.test);
        check(n.consequent);
        check(n.alternate);
        break;
      case 'CallExpression':
        if (n.callee.type !== 'Identifier' || n.optional)
          throw new Error('only named built-ins can be called');
        names.add(n.callee.name);
        for (const a of n.arguments) check(a);
        if (
          ['prop', 'param', 'markerTime', 'audioAmplitude'].includes(n.callee.name) &&
          n.arguments[0]?.type !== 'Literal'
        )
          throw new Error(`${n.callee.name} requires a literal reference`);
        calls.push({
          name: n.callee.name,
          args: n.arguments
            .filter((/** @type {any} */ a) => a.type === 'Literal')
            .map((/** @type {any} */ a) => a.value),
        });
        break;
      default:
        throw new Error(`forbidden expression syntax ${n.type}`);
    }
  };
  check(ast);
  /** @param {Context} context @returns {Value} */
  const evaluate = (context) => {
    /** @param {any} n @returns {any} */
    const run = (n) => {
      switch (n.type) {
        case 'Literal':
          return n.value;
        case 'Identifier': {
          const v = Object.hasOwn(context, n.name) ? context[n.name] : undefined;
          if (v === undefined || typeof v === 'function')
            throw new Error(`unknown value ${n.name}`);
          return v;
        }
        case 'MemberExpression': {
          const object = run(n.object),
            field = n.computed ? n.property.value : n.property.name;
          if (object === null || typeof object !== 'object' || !Object.hasOwn(object, field))
            throw new Error('unknown data field');
          return object[field];
        }
        case 'ArrayExpression':
          return n.elements.map(run);
        case 'UnaryExpression': {
          const a = run(n.argument);
          return n.operator === '!' ? !a : n.operator === '-' ? -a : +a;
        }
        case 'ConditionalExpression':
          return run(n.test) ? run(n.consequent) : run(n.alternate);
        case 'LogicalExpression': {
          const a = run(n.left);
          return n.operator === '&&'
            ? a && run(n.right)
            : n.operator === '||'
              ? a || run(n.right)
              : (a ?? run(n.right));
        }
        case 'CallExpression': {
          const fn = Object.hasOwn(context, n.callee.name) ? context[n.callee.name] : undefined;
          if (typeof fn !== 'function') throw new Error(`unknown function ${n.callee.name}`);
          return fn(...n.arguments.map(run));
        }
        default: {
          const a = run(n.left),
            b = run(n.right);
          switch (n.operator) {
            case '+':
              return a + b;
            case '-':
              return a - b;
            case '*':
              return a * b;
            case '/':
              return a / b;
            case '%':
              return a % b;
            case '**':
              return a ** b;
            case '<':
              return a < b;
            case '<=':
              return a <= b;
            case '>':
              return a > b;
            case '>=':
              return a >= b;
            case '==':
              return a == b;
            case '!=':
              return a != b;
            case '===':
              return a === b;
            default:
              return a !== b;
          }
        }
      }
    };
    const value = run(ast);
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('expression produced a non-finite value');
    return value;
  };
  return { evaluate, names, calls };
}
/** Stateless seeded noise; coordinate hashing does not depend on evaluation order.
 * @param {number} seed @param {...number} coords */
export function noise(seed, ...coords) {
  let h = seed | 0;
  for (const x of coords) {
    const v = Math.floor(x);
    h = Math.imul(h ^ v, 0x45d9f3b);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}
