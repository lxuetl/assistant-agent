import { useState, useRef, useEffect } from 'react';

function App() {
  const [input, setInput] = useState('');
  const [chatLog, setChatLog] = useState([
    { role: 'ai', content: '同学你好！我是 A25 跨课程智能助教，有什么我可以帮你的吗？' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // 💡 新增 1：用来存储抓取到的网页上下文
  const [pageContext, setPageContext] = useState(null);

  const messagesEndRef = useRef(null);

  // 💡 新增 2：监听外部插件传来的 postMessage 快递
  useEffect(() => {
    console.log("🟢 A25 前端已挂载，正在等待接收网页上下文...");

    const handleMessage = (event) => {
      // 检查是不是我们插件发来的专属暗号
      if (event.data && event.data.type === 'A25_PAGE_CONTEXT') {
        console.log("✅ React 成功接收到网页内容:", event.data);
        setPageContext(event.data); // 把网页内容存起来
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatLog]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    // 1. 先把用户的消息放进聊天框 (界面上依然只显示用户手打的字)
    const userMsg = { role: 'user', content: input };
    const newChatLog = [...chatLog, userMsg];
    setChatLog(newChatLog);

    // 准备一个空的 AI 消息占位，用来接收流式文字
    const aiMsgPlaceholder = { role: 'ai', content: '' };
    setChatLog([...newChatLog, aiMsgPlaceholder]);

    const currentInput = input; // 暂存输入内容
    setInput('');
    setIsLoading(true);

    // 🌟 新增 3：隐身注入魔法！悄悄把网页内容拼接到发给后端的数据里
    let finalMessageToSend = currentInput;
    if (pageContext && pageContext.content) {
      finalMessageToSend = `【系统隐秘背景：当前用户正在浏览的网页标题是《${pageContext.title}》，网页核心内容如下：\n${pageContext.content}\n】\n\n基于以上网页内容，请回答用户的问题：${currentInput}`;
    }

    try {
      // 发送请求，注意这里 body 传的是组装过后的 finalMessageToSend
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalMessageToSend })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      // 持续读取后端传来的“活水”
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        accumulatedContent += chunk;

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
      <div style={{
        width: '380px', height: '600px', backgroundColor: '#fff', borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #ebeef5'
      }}>

        {/* 头部导航栏 */}
        <div style={{ backgroundColor: '#1677ff', padding: '16px', color: '#fff', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#52c41a', marginRight: '8px' }}></div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>A25 智能助教 (在线)</h3>
        </div>

        {/* 💡 新增 4：装逼特效 - 顶部的“AI正在同步阅读”提示条 */}
        {pageContext && (
          <div style={{
            backgroundColor: '#e6f4ff', padding: '8px 16px', fontSize: '12px', color: '#1677ff',
            borderBottom: '1px solid #91caff', display: 'flex', alignItems: 'center'
          }}>
            <span style={{ marginRight: '6px' }}>👁️</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              AI 已获取网页: {pageContext.title}
            </span>
          </div>
        )}

        {/* 聊天消息区 */}
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', backgroundColor: '#f5f7fa' }}>
          {chatLog.map((msg, index) => (
            <div key={index} style={{
              display: 'flex', marginBottom: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center',
                backgroundColor: msg.role === 'user' ? '#1677ff' : '#fff', color: msg.role === 'user' ? '#fff' : '#1677ff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '14px', fontWeight: 'bold', marginLeft: msg.role === 'user' ? '12px' : '0', marginRight: msg.role === 'user' ? '0' : '12px'
              }}>
                {msg.role === 'user' ? '我' : 'AI'}
              </div>

              <div style={{
                maxWidth: '70%', padding: '12px 16px', fontSize: '14px', lineHeight: '1.5',
                backgroundColor: msg.role === 'user' ? '#1677ff' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)', wordWrap: 'break-word', whiteSpace: 'pre-wrap'
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