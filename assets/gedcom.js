/* GEDCOM 5.5.1-export för släktträdet. Ren JS, körs i webbläsaren (och i Node för test).
   buildGedcom(persons, relations, opts) -> { text, stats }
   opts: { scope: "all"|"nolead"|"solid", maskLiving: true|false (döljer detaljer, inte namn, för levande), date: Date } */
(function (root) {
"use strict";

const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const REL_SV = { verified:"verifierat", family:"familjebekräftat", strong:"en mycket stark kandidat",
  candidate:"en kandidat", lead:"ett lead (användarträd)", excluded:"uteslutet" };
const STATUS_SV = { verified:"Verifierad", family:"Familjebekräftad", strong:"Mycket stark kandidat",
  candidate:"Kandidat", lead:"Lead (användarträd/sökingång)", excluded:"Utesluten" };

function allowedStatus(scope) {
  if (scope === "solid") return new Set(["verified","family"]);
  if (scope === "nolead") return new Set(["verified","family","strong","candidate"]);
  return new Set(["verified","family","strong","candidate","lead"]);
}

/* ---- namn ---- */
function parseName(raw, id) {
  let s = String(raw || "").trim();
  let maiden = "";
  const m = s.match(/\(f\.\s*([^)\d]+)\)/i);        // (f. Ivanova), inte (f. 1826, Boda)
  if (m) maiden = m[1].trim();
  s = s.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  s = s.replace(/,.*$/, " ").replace(/\//g, "-").replace(/\s+/g, " ").trim();
  let married = "";
  const g = s.match(/^(.*?)\s+g\.\s+(\S+)$/i);        // Maria Olofsdotter g. Johannesson
  if (g) { s = g[1].trim(); married = g[2]; }
  const parts = s.split(" ");
  if (parts.length === 1) return { given: parts[0], surname: maiden, married: "" };
  let surname = parts.pop(), given = parts.join(" ");
  if (maiden) { married = married || surname; surname = maiden; }
  return { given, surname, married };
}

/* ---- datum ---- */
function gdate(v) {
  v = String(v || "").trim();
  if (!v || /^avliden$/i.test(v)) return "";
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${+m[3]} ${MON[+m[2]-1]} ${m[1]}`;
  m = v.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MON[+m[2]-1]} ${m[1]}`;
  if (/^\d{4}$/.test(v)) return v;
  m = v.match(/(\d{4})/);
  if (!m) return "";
  if (/^före/i.test(v)) return `BEF ${m[1]}`;
  return `ABT ${m[1]}`;
}

/* ---- radskrivare (CONT/CONC, max ~200 tecken) ---- */
function emit(out, level, tag, value, pointer) {
  const head = pointer ? `${level} ${pointer} ${tag}` : `${level} ${tag}`;
  if (value === undefined || value === null || value === "") { out.push(head); return; }
  const lines = String(value).replace(/\r/g, "").split("\n");
  lines.forEach((ln, i) => {
    let first = true;
    let rest = ln;
    const pfx = i === 0 ? head + " " : `${level + 1} CONT `;
    let chunk = rest.slice(0, 190); rest = rest.slice(190);
    out.push(pfx + chunk);
    while (rest.length) { chunk = rest.slice(0, 190); rest = rest.slice(190); out.push(`${level + 1} CONC ${chunk}`); }
  });
}

function buildGedcom(persons, relations, opts) {
  opts = Object.assign({ scope: "all", maskLiving: true, date: new Date() }, opts || {});
  const ok = allowedStatus(opts.scope);
  const inc = persons.filter(p => p.status !== "excluded" && ok.has(p.status));
  const P = {}; inc.forEach(p => P[p.id] = p);
  const iid = {}; inc.forEach((p, i) => iid[p.id] = `@I${i + 1}@`);

  // familjer
  const fams = new Map();               // nyckel -> {key,members[],partner:rel|null,children:[{id,rel}]}
  const fam = ids => {
    const key = [...ids].sort().join("|");
    if (!fams.has(key)) fams.set(key, { key, ids: [...ids].sort(), partner: null, kids: [] });
    return fams.get(key);
  };
  let droppedRel = 0;
  for (const r of relations) {
    if (!ok.has(r.status)) { droppedRel++; continue; }
    if (r.type === "partner") {
      if (!P[r.a] || !P[r.b]) { droppedRel++; continue; }
      fam([r.a, r.b]).partner = r;
    } else if (r.type === "child") {
      if (!P[r.child]) { droppedRel++; continue; }
      const par = (r.parents || []).filter(x => P[x]);
      if (!par.length) { droppedRel++; continue; }
      fam(par).kids.push({ id: r.child, rel: r });
    }
  }
  const famList = [...fams.values()];
  const fid = {}; famList.forEach((f, i) => fid[f.key] = `@F${i + 1}@`);
  const famsOf = {}, famcOf = {};
  famList.forEach(f => {
    f.ids.forEach(x => (famsOf[x] = famsOf[x] || []).push(f));
    f.kids.forEach(k => (famcOf[k.id] = famcOf[k.id] || []).push({ f, rel: k.rel }));
  });

  // källor
  const srcIdx = new Map();             // label|url -> pointer
  const srcRecs = [];
  const srcPtr = s => {
    const key = (s.label || "") + "|" + (s.url || "");
    if (!srcIdx.has(key)) { srcIdx.set(key, `@S${srcIdx.size + 1}@`); srcRecs.push(s); }
    return srcIdx.get(key);
  };

  const out = [];
  const d = opts.date, today = `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  emit(out, 0, "HEAD");
  emit(out, 1, "SOUR", "KarmanovaSlaktrad");
  emit(out, 2, "NAME", "Släktträd – Evgenia Karmanova (GitHub Pages)");
  emit(out, 2, "CORP", "Karmanova släktforskning");
  emit(out, 1, "GEDC"); emit(out, 2, "VERS", "5.5.1"); emit(out, 2, "FORM", "LINEAGE-LINKED");
  emit(out, 1, "CHAR", "UTF-8");
  emit(out, 1, "LANG", "Swedish");
  emit(out, 1, "DATE", today);
  emit(out, 1, "SUBM", "@U1@");
  emit(out, 1, "NOTE", "Export från släktträdssidan. Bevisläget (Verifierad / Familjebekräftad / Mycket stark kandidat / Kandidat / Lead) står i varje persons anteckning. Behandla allt utom ”Verifierad” som hypoteser.");
  emit(out, 0, "SUBM", "", "@U1@"); emit(out, 1, "NAME", "Evgenia Karmanova");

  let livingMasked = 0;
  inc.forEach(p => {
    const mask = opts.maskLiving && p.living;
    if (mask) livingMasked++;
    const nm = parseName(p.name, p.id);
    emit(out, 0, "INDI", "", iid[p.id]);
    emit(out, 1, "NAME", `${nm.given} /${nm.surname}/`);
    if (nm.given) emit(out, 2, "GIVN", nm.given);
    if (nm.surname) emit(out, 2, "SURN", nm.surname);
    if (nm.married && !mask) { emit(out, 1, "NAME", `${nm.given} /${nm.married}/`); emit(out, 2, "TYPE", "married"); }
    if (p.sex === "m" || p.sex === "f") emit(out, 1, "SEX", p.sex.toUpperCase());
    if (p.living) emit(out, 1, "RESN", "privacy");
    if (!mask) {
      const b = p.born || {}, dd = p.died || {};
      const bd = gdate(b.date);
      if (bd || b.place || b.note) {
        emit(out, 1, "BIRT"); if (bd) emit(out, 2, "DATE", bd); if (b.place) emit(out, 2, "PLAC", b.place);
        const raw = b.date && !bd ? `Datum enligt källa: ${b.date}. ` : "";
        if (raw || b.note) emit(out, 2, "NOTE", raw + (b.note || ""));
      }
      const dead = gdate(dd.date) || dd.place || dd.note || /avliden/i.test(dd.date || "");
      if (dead) {
        emit(out, 1, "DEAT", gdate(dd.date) || dd.place || dd.note ? "" : "Y");
        if (gdate(dd.date)) emit(out, 2, "DATE", gdate(dd.date));
        if (dd.place) emit(out, 2, "PLAC", dd.place);
        const raw = dd.date && !gdate(dd.date) && !/avliden/i.test(dd.date) ? `Datum enligt källa: ${dd.date}. ` : "";
        if (raw || dd.note) emit(out, 2, "NOTE", raw + (dd.note || ""));
      }
      (p.places || []).forEach(pl => { emit(out, 1, "RESI"); emit(out, 2, "PLAC", pl); });
      const lines = [`Bevisläge: ${STATUS_SV[p.status] || p.status}.`];
      if (p.summary) lines.push(p.summary);
      emit(out, 1, "NOTE", lines.join("\n"));
      if ((p.notes || []).length) emit(out, 1, "NOTE", "Källanteckningar:\n" + p.notes.join("\n"));
      (p.sources || []).forEach(s => emit(out, 1, "SOUR", srcPtr(s)));
    }
    (famcOf[p.id] || []).forEach(({ f, rel }) => {
      emit(out, 1, "FAMC", fid[f.key]); emit(out, 2, "PEDI", "birth");
      if (rel.status !== "verified") emit(out, 2, "NOTE", `Släktskapet är ${REL_SV[rel.status] || rel.status}.`);
    });
    (famsOf[p.id] || []).forEach(f => emit(out, 1, "FAMS", fid[f.key]));
  });

  famList.forEach(f => {
    emit(out, 0, "FAM", "", fid[f.key]);
    let husb = null, wife = null;
    const [a, b] = f.ids;
    if (b === undefined) { if (P[a].sex === "f") wife = a; else husb = a; }
    else {
      const ma = P[a].sex, mb = P[b].sex;
      if (ma === "f" && mb !== "f") { wife = a; husb = b; }
      else if (mb === "f" && ma !== "f") { wife = b; husb = a; }
      else if (ma === "m" && mb === "m") { husb = a; wife = b; }
      else { husb = a; wife = b; }
    }
    if (husb) emit(out, 1, "HUSB", iid[husb]);
    if (wife) emit(out, 1, "WIFE", iid[wife]);
    f.kids.forEach(k => emit(out, 1, "CHIL", iid[k.id]));
    const notes = [];
    if (f.partner) notes.push(`Parförhållandet är ${REL_SV[f.partner.status] || f.partner.status}. ${f.partner.basis || ""}`.trim());
    f.kids.forEach(k => { if (k.rel.status !== "verified") notes.push(`${P[k.id].name}: släktskapet är ${REL_SV[k.rel.status] || k.rel.status} (${k.rel.basis || ""})`); });
    if (notes.length) emit(out, 1, "NOTE", notes.join("\n"));
  });

  srcRecs.forEach(s => {
    emit(out, 0, "SOUR", "", srcIdx.get((s.label || "") + "|" + (s.url || "")));
    emit(out, 1, "TITL", (s.label || "Källa").slice(0, 240));
    if (s.url) emit(out, 1, "NOTE", `Länk: ${s.url}`);
    if ((s.label || "").length > 240) emit(out, 1, "TEXT", s.label);
  });
  emit(out, 0, "TRLR");

  return { text: "﻿" + out.join("\r\n") + "\r\n",
    stats: { persons: inc.length, families: famList.length, sources: srcRecs.length,
             livingMasked, skippedPersons: persons.length - inc.length, droppedRelations: droppedRel } };
}

const api = { buildGedcom, parseName, gdate };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.GedcomExport = api;
})(typeof window !== "undefined" ? window : globalThis);
