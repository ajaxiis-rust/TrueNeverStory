from std.collections import List
from std import subprocess


struct WriteBehindBuffer(Movable):
    var buffer: List[String]
    var max_size: Int
    var flush_count: Int
    var total_items_flushed: Int
    var data_dir: String

    def __init__(out self, data_dir: String = "world_db", max_size: Int = 100):
        self.buffer = List[String]()
        self.max_size = max_size
        self.flush_count = 0
        self.total_items_flushed = 0
        self.data_dir = data_dir

    def append(mut self, data: String):
        self.buffer.append(data)
        if len(self.buffer) >= self.max_size:
            self.flush_now()

    def flush_now(mut self):
        if len(self.buffer) == 0:
            return
        var count = len(self.buffer)
        self.buffer = List[String]()
        self.flush_count += 1
        self.total_items_flushed += count

    def get_buffer_size(self) -> Int:
        return len(self.buffer)

    def get_stats(self) -> String:
        return '{"flush_count":' + String(self.flush_count) + ',"total_items_flushed":' + String(self.total_items_flushed) + ',"current_buffer_size":' + String(len(self.buffer)) + '}'
