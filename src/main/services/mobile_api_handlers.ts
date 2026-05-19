import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MobileAuth } from './mobile_auth';
import type { TaskService } from './task_service';
import type { GateEvaluator } from './gate_evaluator';

export interface MobileApiDeps {
  readonly auth: MobileAuth;
  readonly taskService: TaskService;
  readonly gateEvaluator: GateEvaluator;
}

export function createMobileApiHandler(deps: MobileApiDeps) {
  const requireAuth = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const header = (req.headers.authorization ?? '') as string;
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!deps.auth.verify(token)) {
      void reply.status(401).send({ ok: false, error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  return async function apiHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const rawUrl = (req.url ?? '').split('?')[0];
    const method = req.method;

    // POST /api/login { pin }
    if (method === 'POST' && rawUrl === '/api/login') {
      const body = (req.body ?? {}) as { pin?: string };
      const token = deps.auth.login(req.ip, String(body.pin ?? ''));
      if (!token) {
        void reply.status(401).send({ ok: false, error: 'Bad PIN' });
        return;
      }
      void reply.send({ ok: true, token });
      return;
    }

    if (!requireAuth(req, reply)) return;

    // GET /api/tasks
    if (method === 'GET' && rawUrl === '/api/tasks') {
      const tasks = deps.taskService.listTasks();
      const out = await Promise.all(
        tasks.map(async t => {
          const pending = await deps.gateEvaluator.listPending(t.id);
          return { id: t.id, title: t.title ?? t.id, status: t.status, hasPendingGate: pending.length > 0 };
        }),
      );
      void reply.send({ ok: true, tasks: out });
      return;
    }

    // GET /api/tasks/:id
    const detailMatch = /^\/api\/tasks\/([^/]+)$/.exec(rawUrl);
    if (method === 'GET' && detailMatch) {
      const t = deps.taskService.getTask(detailMatch[1]);
      if (!t) {
        void reply.status(404).send({ ok: false, error: 'Not found' });
        return;
      }
      void reply.send({ ok: true, task: t });
      return;
    }

    // GET /api/tasks/:id/gates
    const gatesMatch = /^\/api\/tasks\/([^/]+)\/gates$/.exec(rawUrl);
    if (method === 'GET' && gatesMatch) {
      const pending = await deps.gateEvaluator.listPending(gatesMatch[1]);
      void reply.send({ ok: true, gates: pending });
      return;
    }

    // POST /api/tasks/:id/gates/:gateId/approve { reason? }
    const approveMatch = /^\/api\/tasks\/([^/]+)\/gates\/([^/]+)\/approve$/.exec(rawUrl);
    if (method === 'POST' && approveMatch) {
      const [, taskId, gateId] = approveMatch;
      const body = (req.body ?? {}) as { reason?: string };
      const ok = await deps.gateEvaluator.resolvePending(taskId, gateId, { status: 'pass', reason: body.reason });
      if (!ok) {
        void reply.status(404).send({ ok: false, error: 'Gate not found' });
        return;
      }
      void reply.send({ ok: true });
      return;
    }

    // POST /api/tasks/:id/gates/:gateId/reject { reason }
    const rejectMatch = /^\/api\/tasks\/([^/]+)\/gates\/([^/]+)\/reject$/.exec(rawUrl);
    if (method === 'POST' && rejectMatch) {
      const [, taskId, gateId] = rejectMatch;
      const body = (req.body ?? {}) as { reason?: string };
      const ok = await deps.gateEvaluator.resolvePending(taskId, gateId, { status: 'fail', reason: body.reason ?? 'Rejected via mobile' });
      if (!ok) {
        void reply.status(404).send({ ok: false, error: 'Gate not found' });
        return;
      }
      void reply.send({ ok: true });
      return;
    }

    void reply.status(404).send({ ok: false, error: 'Route not found' });
  };
}
