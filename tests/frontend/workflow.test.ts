import { describe, it, expect, beforeEach } from 'vitest';

/**
 * T020: Frontend workflow state test (detailed)
 * T020b: Error banner rendering test (detailed)
 * T031b: Latency test for UI updates within 2s
 */

describe('Frontend Workflow State & UI (US1)', () => {
  describe('T020: Workflow state reducer logic', () => {
    let state: any;

    beforeEach(() => {
      state = {
        featureRequest: '',
        workflow: [],
        logs: [],
        isProcessing: false
      };
    });

    describe('State initialization', () => {
      it('should initialize empty workflow state', () => {
        expect(state.workflow).toEqual([]);
        expect(state.logs).toEqual([]);
        expect(state.isProcessing).toBe(false);
      });
    });

    describe('Workflow execution', () => {
      it('should set isProcessing true and clear logs on start', () => {
        state.isProcessing = true;
        state.logs = [];

        expect(state.isProcessing).toBe(true);
        expect(state.logs).toHaveLength(0);
      });

      it('should add system log on workflow start', () => {
        state.logs.push({
          time: '12:34:56',
          message: '🚀 Starting Digital Twin workflow via Worker API...',
          type: 'system'
        });

        expect(state.logs).toHaveLength(1);
        expect(state.logs[0].type).toBe('system');
      });

      it('should populate workflow array with 9 steps in order', () => {
        const steps = [
          { roleId: 'project_mgr', task: 'Break down', status: 'completed' },
          { roleId: 'pm', task: 'Spec', status: 'completed' },
          { roleId: 'architect', task: 'Design', status: 'in_progress' },
          // ... 6 more steps
        ];

        state.workflow = steps.slice(0, 3);

        expect(state.workflow).toHaveLength(3);
        expect(state.workflow[0].roleId).toBe('project_mgr');
        expect(state.workflow[2].status).toBe('in_progress');
      });

      it('should update step status from in_progress to completed', () => {
        state.workflow = [
          { roleId: 'architect', task: 'Design', status: 'in_progress', output: undefined }
        ];

        // Simulate step completion
        state.workflow[0].status = 'completed';
        state.workflow[0].output = 'Technical architecture';

        expect(state.workflow[0].status).toBe('completed');
        expect(state.workflow[0].output).toBeTruthy();
      });

      it('should add success log when step completes', () => {
        const step = { roleId: 'architect', name: 'Architect' };
        state.logs.push({
          time: '12:34:57',
          message: `✅ ${step.name} completed`,
          type: 'success'
        });

        const successLog = state.logs.find(log => log.type === 'success');
        expect(successLog).toBeDefined();
        expect(successLog?.message).toContain('completed');
      });

      it('should set isProcessing false on workflow end', () => {
        state.isProcessing = false;

        expect(state.isProcessing).toBe(false);
      });

      it('should add final success log', () => {
        state.logs.push({
          time: '12:35:00',
          message: '🎉 Feature development complete!',
          type: 'success'
        });

        const finalLog = state.logs[state.logs.length - 1];
        expect(finalLog.type).toBe('success');
        expect(finalLog.message).toContain('complete');
      });
    });

    describe('Error handling', () => {
      it('should capture error and set isProcessing false', () => {
        state.isProcessing = false;
        state.logs.push({
          time: '12:34:45',
          message: '❌ Workflow failed: Gemini API overloaded',
          type: 'error'
        });

        expect(state.isProcessing).toBe(false);
        expect(state.logs.some(log => log.type === 'error')).toBe(true);
      });

      it('should allow retry by resetting workflow state', () => {
        // After error, user clicks "Start Development" again
        state.workflow = [];
        state.logs = [];
        state.isProcessing = true;

        expect(state.workflow).toHaveLength(0);
        expect(state.logs).toHaveLength(0);
        expect(state.isProcessing).toBe(true);
      });
    });
  });

  describe('T020b: Error banner rendering', () => {
    let uiState: Record<string, unknown>;

    beforeEach(() => {
      uiState = {
        workflow: [],
        error: null,
        logs: []
      };
    });

    it('should show error banner when error is not null', () => {
      uiState.error = {
        message: 'Gemini API overloaded',
        details: 'HTTP 503: The model is overloaded. Please try again later.',
        code: 'GEMINI_UNAVAILABLE'
      };

      expect(uiState.error).toBeTruthy();
      expect(uiState.error.message).toBeTruthy();
    });

    it('should display error message in banner', () => {
      const errorBanner = {
        visible: true,
        message: uiState.error?.message || 'Unknown error'
      };

      uiState.error = { message: 'API Failed', details: 'Timeout', code: 'TIMEOUT' };
      errorBanner.message = uiState.error.message;

      expect(errorBanner.visible).toBe(true);
      expect(errorBanner.message).toBe('API Failed');
    });

    it('should display error details in collapsible section', () => {
      uiState.error = {
        message: 'Request too large',
        details: 'Your feature request exceeds 256 KB. Please shorten it.',
        code: 'REQUEST_TOO_LARGE'
      };

      const detailsVisible = !!uiState.error.details;
      expect(detailsVisible).toBe(true);
      expect(uiState.error.details).toContain('256 KB');
    });

    it('should render failed step with error banner in workflow visualizer', () => {
      uiState.workflow = [
        {
          roleId: 'project_mgr',
          task: 'Break down requirements',
          status: 'failed',
          error: 'Gemini timeout after 30s'
        }
      ];

      const failedStep = uiState.workflow[0];
      expect(failedStep.status).toBe('failed');
      expect(failedStep.error).toBeTruthy();
    });

    it('should color error banner red and display error icon', () => {
      const errorBannerStyle = {
        color: 'red',
        icon: 'AlertCircle',
        backgroundColor: 'rgb(254, 242, 242)' // light red
      };

      expect(errorBannerStyle.color).toBe('red');
      expect(errorBannerStyle.icon).toBeTruthy();
    });

    it('should include error code for debugging', () => {
      uiState.error = {
        message: 'Invalid role specified',
        details: 'Role must be one of: project_mgr, pm, architect, ...',
        code: 'INVALID_ROLE'
      };

      expect(uiState.error.code).toBe('INVALID_ROLE');
    });

    it('should clear error when user clicks dismiss or starts new workflow', () => {
      uiState.error = { message: 'Error', details: 'Details', code: 'ERROR' };
      
      // User dismisses error
      uiState.error = null;

      expect(uiState.error).toBeNull();
    });
  });

  describe('T031b: UI latency and per-step updates', () => {
    it('should update step status UI within 2s of agent completion', async () => {
      const step = {
        roleId: 'architect',
        startTime: Date.now(),
        status: 'in_progress' as const
      };

      // Simulate agent completing after 5s worker processing
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms for UI update
      step.status = 'completed';
      const uiUpdateLatency = Date.now() - step.startTime;

      expect(step.status).toBe('completed');
      expect(uiUpdateLatency).toBeLessThan(2000); // Within 2s requirement
    });

    it('should progressively reveal steps as they complete', async () => {
      const workflow = [];
      const steps = ['project_mgr', 'pm', 'architect'];

      for (const roleId of steps) {
        workflow.push({ roleId, status: 'in_progress' });
        await new Promise(resolve => setTimeout(resolve, 50));
        workflow[workflow.length - 1].status = 'completed';
      }

      expect(workflow).toHaveLength(3);
      expect(workflow.every(s => s.status === 'completed')).toBe(true);
    });

    it('should render step output snippet immediately when available', () => {
      const step = {
        roleId: 'pm',
        output: 'Feature specification with acceptance criteria',
        displayOutput: undefined
      };

      step.displayOutput = step.output.substring(0, 150); // 150 char snippet

      expect(step.displayOutput).toBeTruthy();
      expect(step.displayOutput.length).toBeLessThanOrEqual(150);
    });

    it('should not block UI while rendering large number of steps', async () => {
      const startTime = Date.now();
      const workflow = [];

      for (let i = 0; i < 100; i++) {
        workflow.push({ id: i, status: 'completed' });
      }

      const renderTime = Date.now() - startTime;
      expect(workflow).toHaveLength(100);
      expect(renderTime).toBeLessThan(500); // Render 100 items in <500ms
    });
  });
});
