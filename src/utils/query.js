// src/utils/query.js
// يحوّل استعلامات على طراز Firestore (where / and / or / orderBy / limit / startAfter)
// إلى فلتر وترتيب متوافقين مع MongoDB.

const OP_MAP = {
  '==': '$eq',
  '!=': '$ne',
  '<': '$lt',
  '<=': '$lte',
  '>': '$gt',
  '>=': '$gte',
  'in': '$in',
  'not-in': '$nin',
};

function leafToMongo(leaf) {
  const { field, op, value } = leaf;
  if (op === 'array-contains') {
    return { [field]: value }; // Mongo يطابق تلقائياً عنصراً داخل مصفوفة
  }
  if (op === 'array-contains-any') {
    return { [field]: { $in: Array.isArray(value) ? value : [value] } };
  }
  const mongoOp = OP_MAP[op] || '$eq';
  if (mongoOp === '$eq') return { [field]: value };
  return { [field]: { [mongoOp]: value } };
}

// node: leaf {field,op,value}  أو  {op:'and'|'or', items:[node,...]}
function nodeToMongo(node) {
  if (!node) return {};
  if (node.op === 'and' || node.op === 'or') {
    const parts = (node.items || []).map(nodeToMongo).filter((p) => p && Object.keys(p).length);
    if (!parts.length) return {};
    if (parts.length === 1) return parts[0];
    return { [`$${node.op}`]: parts };
  }
  return leafToMongo(node);
}

function buildFilter(filterTree) {
  if (!filterTree) return {};
  return nodeToMongo(filterTree);
}

function buildSort(orders) {
  const sort = {};
  if (!Array.isArray(orders)) return sort;
  for (const o of orders) {
    if (!o || !o.field) continue;
    sort[o.field] = o.dir === 'desc' ? -1 : 1;
  }
  return sort;
}

// startAfterVal: قيمة البداية بعدها (تبسيط: نطبّق شرط أكبر-من على أول حقل ترتيب)
function applyStartAfter(filter, orders, startAfterVal) {
  if (startAfterVal === undefined || startAfterVal === null) return filter;
  if (!Array.isArray(orders) || orders.length === 0) return filter;
  const { field, dir } = orders[0];
  const gtOp = dir === 'desc' ? '$lt' : '$gt';
  if (filter[field] && typeof filter[field] === 'object' && !Array.isArray(filter[field])) {
    filter[field][gtOp] = startAfterVal;
  } else {
    filter[field] = { [gtOp]: startAfterVal };
  }
  return filter;
}

function runQuery({ filterTree, orders, lim, startAfterVal }) {
  const filter = buildFilter(filterTree);
  const sort = buildSort(orders);
  applyStartAfter(filter, orders, startAfterVal);
  return { filter, sort, limit: typeof lim === 'number' ? lim : 0 };
}

module.exports = { runQuery, buildFilter, buildSort };
