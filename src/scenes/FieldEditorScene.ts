import { FieldEditor, type FieldTool } from '../game/FieldEditor';
import { BaseFieldScene } from './BaseFieldScene';
import { useAppStore } from '../store/useAppStore';
import { FIELD_HOME_ID, FIELD_MAP } from '../data/gameData';
import { playSfx, unlockAudio } from '../audio';
import { uid } from '../game/geometry';
import type { FieldSpec } from '../types';

export class FieldEditorScene extends BaseFieldScene {
  private editor!: FieldEditor;
  private nameInput!: HTMLInputElement;
  private windAngle!: HTMLInputElement;
  private windStrength!: HTMLInputElement;
  private windReadout!: HTMLSpanElement;

  constructor() {
    super('fieldEditor');
  }

  create(): void {
    super.create();
    const store = useAppStore.getState();
    const selected = store.customFields.find((f) => f.id === store.selectedFieldId);
    const source: FieldSpec = selected
      ? structuredClone(selected)
      : {
          ...structuredClone(FIELD_MAP[store.selectedFieldId] ?? this.field),
          id: uid('custom-field'),
          name: `${FIELD_MAP[store.selectedFieldId]?.name ?? '自定义'} 改版`,
          description: '基于当前球场复制并调整风场与障碍布局',
          builtIn: false,
          unlockPoints: 0
        };
    this.applyEditedField(source);
    this.editor = new FieldEditor(this, this.fieldView, source, (field) => this.applyEditedField(field));
    this.makeControls();
  }

  private applyEditedField(field: FieldSpec): void {
    this.field = field;
    this.fieldView.field = field;
    this.drawStaticField();
    this.editor?.redraw();
  }

  protected onViewResize(): void {
    if (this.editor) this.applyEditedField(this.editor.field);
  }

  private makeControls(): void {
    const root = this.makeUi('field-editor-ui');
    root.innerHTML = `
      <div class="panel topbar">
        <div><strong>半场与风场编辑</strong><span class="muted">内置球场可另存为自定义版本；路线会绕开实体障碍。</span></div>
        <div class="row gap"><button data-action="back">返回球场</button><button class="primary" data-action="save">保存球场</button></div>
      </div>
      <div class="panel left-tools field-tools">
        <label>名称 <input data-field="name" value="我的半场" /></label>
        <div class="tool-grid three">
          <button data-tool="select" class="active">移动</button>
          <button data-tool="stand">看台</button>
          <button data-tool="tree">树</button>
          <button data-tool="net">网</button>
          <button data-tool="crate">箱</button>
          <button data-tool="wind">风区</button>
          <button data-tool="erase">删除</button>
        </div>
        <label>全局风向 <input type="range" min="-180" max="180" value="${String(Math.round((this.editor.field.globalWind.angle * 180) / Math.PI))}" data-wind="angle" /></label>
        <label>风力 <input type="range" min="0" max="45" value="${this.editor.field.globalWind.strength}" data-wind="strength" /><span data-wind-readout>${this.editor.field.globalWind.strength}</span></label>
        <button data-action="rotate" class="small">旋转最后添加障碍</button>
        <p class="muted">风向：0=向右，90=向下，180/-180=向左；蓝色区域是局部阵风。</p>
      </div>
    `;
    this.nameInput = root.querySelector('[data-field="name"]')!;
    this.windAngle = root.querySelector('[data-wind="angle"]')!;
    this.windStrength = root.querySelector('[data-wind="strength"]')!;
    this.windReadout = root.querySelector('[data-wind-readout]')!;
    this.nameInput.value = this.editor.field.name;

    root.addEventListener('click', (event) => {
      unlockAudio();
      const button = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!button) return;
      playSfx('click');
      if (button.dataset.tool) {
        this.editor.setTool(button.dataset.tool as FieldTool);
        root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b === button));
      }
      if (button.dataset.action === 'back') useAppStore.getState().setScreen('fields');
      if (button.dataset.action === 'save') this.saveField();
      if (button.dataset.action === 'rotate') this.editor.rotateSelected(0.12);
    });

    const updateWind = () => {
      const angle = (Number(this.windAngle.value) * Math.PI) / 180;
      const strength = Number(this.windStrength.value);
      this.editor.setGlobalWind(angle, strength);
      this.windReadout.textContent = String(strength);
    };
    this.windAngle.addEventListener('input', updateWind);
    this.windStrength.addEventListener('input', updateWind);
  }

  private saveField(): void {
    const field: FieldSpec = {
      ...this.editor.field,
      name: this.nameInput.value.trim() || '未命名半场',
      builtIn: false,
      unlockPoints: 0
    };
    useAppStore.getState().saveCustomField(field);
    useAppStore.getState().selectField(field.id);
    playSfx('score');
    useAppStore.getState().setScreen('fields');
  }
}

export const FIELD_EDITOR_HOME_ID = FIELD_HOME_ID;
