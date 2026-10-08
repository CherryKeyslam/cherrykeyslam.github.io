// Turns a typed formula like "z^2 + c" into a GLSL expression built from the
// shader's complex helpers (cmul, inv, cpow, cpowi, cln, cexp, csin, ccos).
// Needs math.js loaded first (global `math`).

class FormulaError extends Error {}

// variables the user may type -> names inside the shader
const VARS = { z: 'z', c: 'z0' };

// built-in constants
const CONSTS = {
  i:  'vec2(0.0, 1.0)',
  pi: 'vec2(3.14159265, 0.0)',
  e:  'vec2(2.71828183, 0.0)',
};

// functions the user may call -> shader function and argument count.
// Friendly names and the shader's own names both work.
const FUNCS = {
  sin:  { glsl: 'csin', args: 1 }, csin: { glsl: 'csin', args: 1 },
  cos:  { glsl: 'ccos', args: 1 }, ccos: { glsl: 'ccos', args: 1 },
  exp:  { glsl: 'cexp', args: 1 }, cexp: { glsl: 'cexp', args: 1 },
  log:  { glsl: 'cln',  args: 1 }, ln:   { glsl: 'cln',  args: 1 }, cln: { glsl: 'cln', args: 1 },
  inv:  { glsl: 'inv',  args: 1 },
  cmul: { glsl: 'cmul', args: 2 },
  pow:  { power: true,  args: 2 }, cpow: { power: true, args: 2 },
  cpowi:{ powerInt: true, args: 2 },
};

const NODE_LABELS = {
  AssignmentNode: 'Assignments (=)',
  FunctionAssignmentNode: 'Function definitions',
  ArrayNode: 'Lists and matrices ([...])',
  IndexNode: 'Indexing ([...])',
  AccessorNode: 'Indexing ([...])',
  ObjectNode: 'Objects ({...})',
  RangeNode: 'Ranges (a:b)',
  BlockNode: 'Multiple statements (; or new lines)',
  ConditionalNode: 'Conditionals (? :)',
  RelationalNode: 'Comparisons',
};

const FUNC_LIST = 'sin, cos, exp, log (or ln), inv, pow, cmul, cpowi';
const MAX_INT_POWER = 64;   // above this, cpowi's loop gets slow; fall back to cpow

function flt(v){
  const s = String(v);
  return /[.e]/i.test(s) ? s : s + '.0';
}

// whole-number exponent (allowing a leading minus), or null
function intExponent(n){
  if (n.isParenthesisNode) return intExponent(n.content);
  if (n.isConstantNode && Number.isInteger(n.value)) return n.value;
  if (n.isOperatorNode && n.fn === 'unaryMinus') {
    const k = intExponent(n.args[0]);
    return k === null ? null : -k;
  }
  return null;
}

function powerGLSL(baseNode, expNode){
  const k = intExponent(expNode);
  if (k !== null && Math.abs(k) <= MAX_INT_POWER) {
    if (k === 0) return 'vec2(1.0, 0.0)';
    const a = toGLSL(baseNode);
    const p = Math.abs(k) === 1 ? a : `cpowi(${a}, ${Math.abs(k)})`;
    return k < 0 ? `inv(${p})` : p;
  }
  return `cpow(${toGLSL(baseNode)}, ${toGLSL(expNode)})`;
}

function toGLSL(n){
  switch (n.type) {
    case 'ParenthesisNode':
      return toGLSL(n.content);

    case 'ConstantNode':
      if (typeof n.value !== 'number')
        throw new FormulaError(`"${n.toString()}" isn't a number. Only numbers, z, c, i, pi and e can appear in a formula.`);
      return `vec2(${flt(n.value)}, 0.0)`;

    case 'SymbolNode': {
      if (n.name in VARS)   return VARS[n.name];
      if (n.name in CONSTS) return CONSTS[n.name];
      if (n.name in FUNCS)
        throw new FormulaError(`"${n.name}" is a function. Write it with brackets, like ${n.name}(z).`);
      throw new FormulaError(`Unknown variable "${n.name}". Use z for the orbit and c for the pixel's starting point.`);
    }

    case 'FunctionNode': {
      const name = n.fn.isSymbolNode ? n.fn.name : n.fn.toString();
      const f = FUNCS[name];
      if (!f) {
        if (name in VARS || name in CONSTS)
          throw new FormulaError(`"${name}(...)" treats ${name} as a function. Put * between them, like ${name}*(z+1).`);
        throw new FormulaError(`Unknown function "${name}". Available: ${FUNC_LIST}.`);
      }
      if (n.args.length !== f.args)
        throw new FormulaError(`"${name}" takes ${f.args} argument${f.args > 1 ? 's' : ''}, but got ${n.args.length}.`);
      if (f.power) return powerGLSL(n.args[0], n.args[1]);
      if (f.powerInt) {
        const k = intExponent(n.args[1]);
        if (k === null || k < 1)
          throw new FormulaError(`cpowi needs a positive whole-number exponent, like cpowi(z, 3). For other powers use z^w.`);
        return `cpowi(${toGLSL(n.args[0])}, ${k})`;
      }
      return `${f.glsl}(${n.args.map(toGLSL).join(', ')})`;
    }

    case 'OperatorNode': {
      if (n.fn === 'unaryMinus') return `(-${toGLSL(n.args[0])})`;
      if (n.fn === 'unaryPlus')  return toGLSL(n.args[0]);
      if (n.op === '^') return powerGLSL(n.args[0], n.args[1]);
      const [a, b] = n.args.map(toGLSL);
      switch (n.op) {
        case '+': return `(${a} + ${b})`;
        case '-': return `(${a} - ${b})`;
        case '*': return `cmul(${a}, ${b})`;
        case '/': return `cmul(${a}, inv(${b}))`;
      }
      throw new FormulaError(`The operator "${n.op}" isn't supported. Use + - * / ^.`);
    }
  }
  const label = NODE_LABELS[n.type] || n.type;
  throw new FormulaError(`${label} can't be used in a formula.`);
}

// text -> { glsl, vars } or throws FormulaError
function compileFormula(text){
  if (!text.trim()) throw new FormulaError('The formula is empty. Try z^2 + c.');
  let node;
  try {
    node = math.parse(text);
  } catch (err) {
    throw new FormulaError(`Couldn't read the formula: ${err.message}`);
  }
  const glsl = toGLSL(node);
  const vars = new Set(
    node.filter((m, path) => m.isSymbolNode && path !== 'fn' && m.name in VARS).map(m => m.name)
  );
  return { glsl, vars };
}
