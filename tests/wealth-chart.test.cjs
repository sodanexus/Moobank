const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function wealthCurve('), source.indexOf('let _wealthChartFrame')), context);

test('le lissage passe par les mesures sans créer de dépassement entre elles', () => {
  for (const values of [[0, 10, 0, 20, 21, 1], [100, 100, 100], [5, 1], [0, 1000, 1, 2]]) {
    const points = values.map((y,i)=>({x:i/(values.length-1),y}));
    const curve = context.wealthCurve(points);
    for (const p of points) assert.ok(Math.abs(curve(p.x)-p.y)<1e-8);
    for(let i=0;i<points.length-1;i++) for(let j=0;j<=100;j++) {
      const y=curve(points[i].x+(points[i+1].x-points[i].x)*j/100);
      assert.ok(Number.isFinite(y));
      assert.ok(y>=Math.min(values[i],values[i+1])-1e-8 && y<=Math.max(values[i],values[i+1])+1e-8);
    }
  }
});

test('le lissage reste borné avec des intervalles de tailles différentes', () => {
  const points=[{x:0,y:10},{x:.001,y:30},{x:.8,y:31},{x:1,y:0}];
  const curve=context.wealthCurve(points);
  for(let i=0;i<1001;i++)assert.ok(curve(i/1000)>=0 && curve(i/1000)<=31);
  assert.equal(curve(-1),10);assert.equal(curve(2),0);
});
