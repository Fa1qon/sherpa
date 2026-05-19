import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BpmnViewer } from '../../../../src/presentation/fileviewer/bpmn/BpmnViewer';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="d1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="p1" isExecutable="true">
    <bpmn:startEvent id="s1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="di1">
    <bpmndi:BPMNPlane id="pl1" bpmnElement="p1">
      <bpmndi:BPMNShape id="sh1" bpmnElement="s1">
        <dc:Bounds x="100" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe('BpmnViewer', () => {
  it('mounts without crashing', () => {
    const { container } = render(
      <BpmnViewer
        content={SAMPLE}
        ext="bpmn"
        projectPath=""
        relPath="test.bpmn"
      />
    );
    expect(container.firstChild).toBeTruthy();
  });
});
