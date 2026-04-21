from locust import HttpUser, task, between

class A25StressTest(HttpUser):
    wait_time = between(1, 3)

    @task
    def trigger_mock(self):
        payload = {
            "course_id": "demo",
            "error_context": "极限抗压测试",
            "suggestion": "保持冷静"
        }
        # 🎯 严格瞄准我们刚才在网关里写的 /api/mock_ai_generate
        with self.client.post("/api/mock_ai_generate", json=payload, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"崩溃了！状态码: {response.status_code}, 内容: {response.text}")