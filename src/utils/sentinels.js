// src/utils/sentinels.js
// يحلّل القيم الخاصة (serverTimestamp, arrayUnion, arrayRemove, increment)
// القادمة من firestore-shim.js في الفرونت إند ويحوّلها لعمليات MongoDB.

function isSentinel(v) {
  return v && typeof v === 'object' && typeof v.__op === 'string';
}

// يبني update object لـ MongoDB (يُستخدم مع updateOne) من بيانات فيها sentinels محتملة
function buildMongoUpdate(data) {
  const set = {};
  const addToSet = {};
  const pull = {};
  const inc = {};
  const currentDate = {};

  function walk(obj, prefix) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (isSentinel(val)) {
        switch (val.__op) {
          case 'serverTimestamp':
            currentDate[path] = true;
            break;
          case 'arrayUnion':
            addToSet[path] = { $each: val.values || [] };
            break;
          case 'arrayRemove':
            pull[path] = { $in: val.values || [] };
            break;
          case 'increment':
            inc[path] = typeof val.value === 'number' ? val.value : 1;
            break;
          default:
            set[path] = val;
        }
      } else if (val && typeof val === 'object' && !Array.isArray(val) && val._isDate !== true) {
        // كائن متداخل عادي — نضبطه ككل (فايرستور يستبدل الكائن كاملاً عند updateDoc
        // إلا إذا استخدم المستخدم dot notation صراحة في المفتاح)
        set[path] = val;
      } else {
        set[path] = val;
      }
    }
  }

  walk(data, '');

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;
  if (Object.keys(pull).length) update.$pull = pull;
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(currentDate).length) update.$currentDate = currentDate;

  return update;
}

// لعمليات setDoc/addDoc: نحل السنتينلز مباشرة داخل الكائن (بدل عمليات Mongo) لأنها كتابة كاملة
function resolvePlainData(data) {
  const out = Array.isArray(data) ? [] : {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (isSentinel(val)) {
      switch (val.__op) {
        case 'serverTimestamp':
          out[key] = new Date();
          break;
        case 'arrayUnion':
          out[key] = val.values || [];
          break;
        case 'arrayRemove':
          out[key] = [];
          break;
        case 'increment':
          out[key] = typeof val.value === 'number' ? val.value : 0;
          break;
        default:
          out[key] = val;
      }
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = resolvePlainData(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

module.exports = { isSentinel, buildMongoUpdate, resolvePlainData };
