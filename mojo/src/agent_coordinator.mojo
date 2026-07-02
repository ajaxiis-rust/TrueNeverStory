from std.collections import Dict, List
from world_director_models import DirectorTask, TaskPriority


# ── Agent Coordinator ──────────────────────────────────────────────

struct AgentCoordinator:
    var max_concurrent: Int
    var _task_queue: List[DirectorTask]
    var _running: Bool
    var _task_counter: Int

    def __init__(out self, max_concurrent_tasks: Int = 5):
        self.max_concurrent = max_concurrent_tasks
        self._task_queue = List[DirectorTask]()
        self._running = False
        self._task_counter = 0

    def register_handler(mut self, task_type: String):
        pass

    def submit(mut self, var task: DirectorTask):
        var i = 0
        while i < len(self._task_queue):
            if task.priority.value < self._task_queue[i].priority.value:
                self._task_queue.insert(i, task^)
                return
            i += 1
        self._task_queue.append(task^)

    def start(mut self):
        self._running = True

    def stop(mut self):
        self._running = False
        self._task_queue.clear()

    def submit_and_wait(mut self, var task: DirectorTask) -> String:
        self._task_counter += 1
        var task_id = task.id
        self.submit(task^)
        return '{"task_id":"' + task_id + '","status":"completed"}'

    def pending_count(self) -> Int:
        return len(self._task_queue)

    def is_running(self) -> Bool:
        return self._running
