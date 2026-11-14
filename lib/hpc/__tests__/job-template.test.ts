import { describe, it, expect } from 'vitest';
import { expand, evalCondition, applyTemplate, type AppTemplate } from '../job-template';
import foamTemplate from '../../../apps/templates/cfd/openfoam.json';

describe('expand', () => {
  it('replaces VAR.x and joins words around +', () => {
    expect(expand('VAR.bin VAR.dim + VAR.dp -t + VAR.n', { bin: 'fluent', dim: '3d', dp: 'dp', n: 4 }, true)).toBe('fluent 3ddp -t4');
  });

  it('drops a (group) whose field is unset, keeps it otherwise', () => {
    expect(expand('run (-i "VAR.f")', {}, true)).toBe('run');
    expect(expand('run (-i "VAR.f")', { f: 'a b.jou' }, true)).toBe('run -i "a b.jou"');
    expect(expand('run (-x VAR.flag)', { flag: false }, true)).toBe('run');
  });

  it('handles [name ? [text]] and [name ? a : b] against fields and the job type', () => {
    expect(expand('[batch ? [-g]]', { type: 'batch' })).toBe('-g');
    expect(expand('[batch ? [-g]]', { type: 'remote' })).toBe('');
    expect(expand('[ remote ? true :  false ]', { type: 'remote' })).toBe('true');
    expect(expand('[ remote ? true :  false ]', { type: 'batch' })).toBe('false');
  });

  it('joins arrays with commas and keeps lines unless singleLine', () => {
    expect(expand('x VAR.list', { list: ['mesh', 'run'] }, true)).toBe('x mesh,run');
    expect(expand(['a  VAR.v', 'b'], { v: 1 })).toBe('a 1\nb');
    expect(expand(undefined, {})).toBe('');
  });
});

describe('evalCondition', () => {
  it('compares fields to quoted values and other fields', () => {
    expect(evalCondition("runMode!='-batch'", { runMode: '-server' })).toBe(true);
    expect(evalCondition("runMode!='-batch'", { runMode: '-batch' })).toBe(false);
    expect(evalCondition('a==b', { a: 1, b: '1' })).toBe(true);
    expect(evalCondition('n>=4', { n: '8' })).toBe(true);
  });

  it('handles brackets, booleans and junk', () => {
    expect(evalCondition('[ batch ? true : false ]', { type: 'batch' })).toBe(true);
    expect(evalCondition(true, {})).toBe(true);
    expect(evalCondition(undefined, {})).toBe(false);
    expect(evalCondition('nonsense', {})).toBe(false);
  });
});

// Shape of the merged cfd/ansys_fluent template (apps/templates + drop-ins).
const fluent: AppTemplate = {
  parameters: {
    default: {
      outputFile: 'outputFile.log',
      defaultOps: '[batch ? [-g]]',
      dimension: '2d',
      ddp: 'dp',
      scriptCommands: ['/file/read-case-data CASE.cas', 'exit'],
    },
    appBinaries: { '2023R1': '/opt/ansys/v231/fluent', '2024R1': '/opt/ansys/v241/fluent' },
    mainCommand: 'VAR.appBinaries VAR.dimension + VAR.ddp VAR.defaultOps -t + VAR.numProcs VAR.meshing (-i "VAR.inputFileName")',
    prologueCommands: [],
  },
  fields: {
    dimension: { type: 'radioButtons', radios: { '2d': { caption: '2D', value: '2d' }, '3d': { caption: '3D', value: '3d' } } },
    ddp: { type: 'checkbox', value: { true: 'dp', false: '' } },
    meshing: { type: 'checkbox', value: { true: '-meshing', false: '' } },
  },
};

describe('applyTemplate', () => {
  it('builds the Fluent command from an uploaded input file', () => {
    const args = applyTemplate(fluent, {
      type: 'batch', procs: 8, dimension: '3d', ddp: true, meshing: false, version: '2023R1',
      useinputFile: true, 'inputFile[]': '/tmp/uploads/u/x/case 1.jou',
    });
    expect(args.mainCommand).toBe('/opt/ansys/v231/fluent 3ddp -g -t8 -i "case 1.jou"');
    expect(args.outputFile).toBe('outputFile.log');
    expect(args.numProcs).toBe(8);
  });

  it('uses defaults, the last version, and ignores a client-sent command or binary', () => {
    const args = applyTemplate(fluent, { type: 'remote', numProcs: 2, mainCommand: 'rm -rf ~', appBinaries: '/bin/evil' });
    expect(args.mainCommand).toBe('/opt/ansys/v241/fluent 2d -t2');
    expect(args.version).toBe('2024R1');
    expect(args.scriptCommands).toBe('/file/read-case-data CASE.cas\nexit');
  });

  it('refuses to build a command when no binary is configured', () => {
    const noBinaries = { ...fluent, parameters: { ...fluent.parameters, appBinaries: {} } };
    expect(() => applyTemplate(noBinaries, { type: 'batch' })).toThrow(/No installed version/);
  });

  it('keeps an explicit inputFileName for written scripts', () => {
    const args = applyTemplate(fluent, { type: 'batch', numProcs: 1, useinputFile: true, inputFileSource: 'write', inputFileName: 'run.jou' });
    expect(args.mainCommand).toContain('-i "run.jou"');
  });

  it('drops disabled fields and toggled-off optional fields', () => {
    const form: AppTemplate = {
      parameters: { mainCommand: 'x (VAR.batchmode) (-pod VAR.pod)' },
      fields: {
        runMode: { type: 'radioButtons' },
        batchmode: { type: 'checkBoxes', disabled: "runMode!='-batch'" },
        pod: { type: 'textField', checkbox: true },
      },
    };
    expect(applyTemplate(form, { runMode: '-server', batchmode: ['mesh'], usepod: false, pod: 'KEY' }).mainCommand).toBe('x');
    expect(applyTemplate(form, { runMode: '-batch', batchmode: ['mesh', 'run'], usepod: true, pod: 'KEY' }).mainCommand).toBe('x mesh,run -pod KEY');
  });
});

describe('OpenFOAM template', () => {
  const foam = foamTemplate as AppTemplate;
  const base = { type: 'batch', numProcs: 1, useinputFile: true, 'inputFile[]': '/tmp/uploads/u/x/cavity.tar.gz', outputFile: 'output.log' };

  it('unpacks the case, meshes it and runs the solver with its log in the job folder', () => {
    const args = applyTemplate(foam, { ...base, solver: 'icoFoam', blockMesh: true });
    expect(args.mainCommand).toBe('icoFoam > "$jobdir/output.log" 2>&1');
    expect(args.prologueCommands).toContain('source /usr/lib/openfoam/openfoam2512/etc/bashrc');
    expect(args.prologueCommands).toContain('tar -xf "cavity.tar.gz"');
    expect(args.prologueCommands).toContain('blockMesh > log.blockMesh 2>&1');
    expect(args.prologueCommands.indexOf('jobdir=$PWD')).toBeLessThan(args.prologueCommands.indexOf('cd '));
  });

  it('skips blockMesh when unticked', () => {
    const args = applyTemplate(foam, { ...base, solver: 'simpleFoam', blockMesh: false });
    expect(args.mainCommand).toBe('simpleFoam > "$jobdir/output.log" 2>&1');
    expect(args.prologueCommands).not.toContain('blockMesh');
  });
});
