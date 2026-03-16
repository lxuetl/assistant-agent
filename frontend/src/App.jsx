import { useState, useRef, useEffect } from 'react';

function App() {
  const [input, setInput] = useState('');
  const [chatLog, setChatLog] = useState([
    { role: 'ai', content: '同学你好！我是 A25 跨课程智能助教，有什么我可以帮你的吗？' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [chatLog]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // 1. 先把用户的消息放进聊天框
    const userMsg = { role: 'user', content: input };
    const newChatLog = [...chatLog, userMsg];
    setChatLog(newChatLog);

    // 准备一个空的 AI 消息占位，用来接收流式文字
    const aiMsgPlaceholder = { role: 'ai', content: '' };
    setChatLog([...newChatLog, aiMsgPlaceholder]);

    const currentInput = input; // 暂存输入内容
    setInput('');
    setIsLoading(true);

    try {

      // ✅ 正确写法（把活儿交给 Nginx 门卫去内部转发）：
     const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput })
      });

      // 💡 修改点 2：不要用 res.json()，改用读取器 (Reader)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      // 持续读取后端传来的“活水”
      while (true) {
        const { done, value } = await reader.read();
        if (done) break; // 读取完成，退出循环

        const chunk = decoder.decode(value); // 将字节流转为文字
        accumulatedContent += chunk;

        // 💡 实时更新界面，实现“打字机”效果
        setChatLog(prevLog => {
          const updatedLog = [...prevLog];
          const lastIndex = updatedLog.length - 1;
          updatedLog[lastIndex] = { ...updatedLog[lastIndex], content: accumulatedContent };
          return updatedLog;
        });
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setChatLog(prev => [...prev.slice(0, -1), { role: 'ai', content: '连接超时，请检查后端服务。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent'
    }}>
      {/* 模拟的悬浮窗面板 */}
      <div style={{
        width: '380px', height: '600px', backgroundColor: '#fff', borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #ebeef5'
      }}>

        {/* 头部导航栏 */}
        <div style={{ backgroundColor: '#1677ff', padding: '16px', color: '#fff', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#52c41a', marginRight: '8px' }}></div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>A25 智能助教 (在线)</h3>
        </div>

        {/* 聊天消息区 */}
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', backgroundColor: '#f5f7fa' }}>
          {chatLog.map((msg, index) => (
            <div key={index} style={{
              display: 'flex', marginBottom: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}>
              {/* 头像 */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center',
                backgroundColor: msg.role === 'user' ? '#1677ff' : '#fff', color: msg.role === 'user' ? '#fff' : '#1677ff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '14px', fontWeight: 'bold', marginLeft: msg.role === 'user' ? '12px' : '0', marginRight: msg.role === 'user' ? '0' : '12px'
              }}>
                {msg.role === 'user' ? '我' : 'AI'}
              </div>

              {/* 消息气泡 */}
              <div style={{
                maxWidth: '70%', padding: '12px 16px', fontSize: '14px', lineHeight: '1.5',
                backgroundColor: msg.role === 'user' ? '#1677ff' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)', wordWrap: 'break-word'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ display: 'flex', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fff', color: '#1677ff', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginRight: '12px', fontSize: '12px' }}>AI</div>
              <div style={{ padding: '12px 16px', backgroundColor: '#fff', borderRadius: '4px 16px 16px 16px', color: '#999', fontSize: '14px' }}>正在思考中... 🤔</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入区 */}
        <div style={{ padding: '12px 16px', backgroundColor: '#fff', borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <input
            style={{ flex: 1, padding: '10px 16px', borderRadius: '20px', border: '1px solid #dcdfe6', outline: 'none', backgroundColor: '#f5f7fa', fontSize: '14px' }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="输入您的问题，按回车发送..."
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            style={{ marginLeft: '12px', padding: '10px 20px', borderRadius: '20px', backgroundColor: (isLoading || !input.trim()) ? '#a0c5e8' : '#1677ff', color: '#fff', border: 'none', cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;