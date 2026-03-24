import { useState, useRef, useEffect } from 'react';

function App() {
  const [input, setInput] = useState('');
  const [chatLog, setChatLog] = useState([
    { role: 'ai', content: '同学你好！我是 A25 跨课程智能助教，有什么我可以帮你的吗？' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // 用来存储抓取到的网页上下文
  const [pageContext, setPageContext] = useState(null);

  // 出题功能相关的状态
  const [quiz, setQuiz] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const messagesEndRef = useRef(null);

  // 监听外部插件传来的 postMessage 快递
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

  // 🎯 触发后端出题的函数
  const handleGenerateQuiz = async () => {
    if (!pageContext) {
      alert("还没抓取到课件内容，稍等一下哦！");
      return;
    }
    setQuizLoading(true);
    setQuiz(null);
    setSelectedOption(null);
    setShowExplanation(false);

    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_context: pageContext })
      });

      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setQuiz(data); // 拿到题目，渲染 UI
      }
    } catch (error) {
      console.error("出题失败:", error);
      alert("出题请求失败，请检查后端 FastAPI 是否启动并且接口配置正确！");
    } finally {
      setQuizLoading(false);
    }
  };

  // 🎯 收起练习，并无缝融入对话流，同时悄悄存入数据库
  const handleCloseQuiz = () => {
    if (showExplanation && selectedOption && quiz) {
      const isCorrect = selectedOption === quiz.answer;

      const reportMsg = {
        role: 'user',
        content: `[系统记录] 我刚刚完成了一道关于课件的测试题。\n题目：${quiz.question}\n我的回答：${selectedOption}（${isCorrect ? '正确 🎉' : '错误 ❌'}）`
      };

      const aiReply = {
        role: 'ai',
        content: isCorrect
          ? '太棒了！看来你对这部分知识掌握得很扎实，还要继续往下学习吗？'
          : '没关系，错题是最好的老师！刚才那题的解析你看懂了吗？需要我再给你通俗地讲一遍吗？'
      };

      setChatLog(prev => [...prev, reportMsg, aiReply]);

      // 悄悄给后端的 SQLite 数据库发送一条 POST 记录
      fetch('/api/save_quiz_record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: quiz.question,
          user_choice: selectedOption,
          correct_answer: quiz.answer,
          is_correct: isCorrect,
          explanation: quiz.explanation
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          console.log("✅ 战况已永久写入 SQLite 数据库:", data);
        }
      })
      .catch(err => console.error("数据库写入失败:", err));
    }

    setQuiz(null);
    setSelectedOption(null);
    setShowExplanation(false);
  };

  // 发送聊天消息
  const sendMessage = async () => {
    if (!input.trim()) return;

    const currentInput = input;
    const userMsg = { role: 'user', content: currentInput };

    // 立即在前端界面显示用户发的消息（只显示纯净的问题，不显示隐秘背景）
    const newChatLog = [...chatLog, userMsg];
    setChatLog(newChatLog);

    const aiMsgPlaceholder = { role: 'ai', content: '' };
    setChatLog([...newChatLog, aiMsgPlaceholder]);

    setInput('');
    setIsLoading(true);

    // 🌟 【核心修改区域】：构建纯净的请求体 🌟
    const requestBody = {
      message: currentInput // 字段1：干净的用户聊天内容
    };

    // 字段2：如果抓到了网页，单独放在 page_context 字段里传给后端
    if (pageContext && pageContext.content) {
      requestBody.page_context = {
        title: pageContext.title,
        content: pageContext.content
      };
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody) // 👈 发送结构分离的数据
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

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

        {/* 顶部的“AI正在同步阅读”提示条 */}
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

        {/* 出题按钮与答题卡 UI */}
        {pageContext && (
          <div style={{ padding: '10px 16px', backgroundColor: '#fff', borderBottom: '1px solid #ebeef5' }}>
            {!quiz && (
              <button
                onClick={handleGenerateQuiz}
                disabled={quizLoading}
                style={{
                  width: '100%', padding: '10px', backgroundColor: quizLoading ? '#d9d9d9' : '#52c41a',
                  color: '#fff', border: 'none', borderRadius: '6px', cursor: quizLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold', transition: 'background-color 0.3s'
                }}
              >
                {quizLoading ? "🧠 AI 正在查阅课件出题中..." : "📝 根据当前网页考考我"}
              </button>
            )}

            {quiz && (
              <div style={{ marginTop: '5px', padding: '15px', backgroundColor: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '8px', position: 'relative' }}>
                <button
                  onClick={handleCloseQuiz}
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#999', padding: '0 5px' }}
                  title="收起答题卡"
                >
                  ✖
                </button>

                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#333', paddingRight: '20px', lineHeight: '1.5' }}>
                  {quiz.question}
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {quiz.options.map((opt) => (
                    <label key={opt.key} style={{
                      display: 'block', padding: '8px 10px', cursor: showExplanation ? 'default' : 'pointer',
                      backgroundColor: selectedOption === opt.key ? '#e6f4ff' : '#fff',
                      border: `1px solid ${selectedOption === opt.key ? '#91caff' : '#d9d9d9'}`,
                      borderRadius: '6px', fontSize: '13px', transition: 'all 0.2s'
                    }}>
                      <input
                        type="radio"
                        name="quizOption"
                        value={opt.key}
                        onChange={() => setSelectedOption(opt.key)}
                        disabled={showExplanation}
                        style={{ marginRight: '8px' }}
                      />
                      <strong>{opt.key}.</strong> {opt.value}
                    </label>
                  ))}
                </div>

                {!showExplanation && selectedOption && (
                  <button
                    onClick={() => setShowExplanation(true)}
                    style={{ marginTop: '15px', width: '100%', padding: '10px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    提交答案
                  </button>
                )}

                {showExplanation && (
                  <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: selectedOption === quiz.answer ? '#f6ffed' : '#fff2f0', border: `1px solid ${selectedOption === quiz.answer ? '#b7eb8f' : '#ffccc7'}` }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: selectedOption === quiz.answer ? '#389e0d' : '#cf1322' }}>
                        {selectedOption === quiz.answer ? "🎉 回答正确！" : `❌ 回答错误。正确答案是：${quiz.answer}`}
                      </p>
                      <p style={{ margin: 0, fontSize: '13px', color: '#555', lineHeight: '1.6' }}>
                        <strong>解析：</strong>{quiz.explanation}
                      </p>
                    </div>

                    <button
                      onClick={handleCloseQuiz}
                      style={{ padding: '10px', backgroundColor: '#fff', border: '1px solid #1677ff', color: '#1677ff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                    >
                      完成练习并继续对话
                    </button>
                  </div>
                )}
              </div>
            )}
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
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '14px', fontWeight: 'bold', marginLeft: msg.role === 'user' ? '12px' : '0', marginRight: msg.role === 'user' ? '0' : '12px', flexShrink: 0
              }}>
                {msg.role === 'user' ? '我' : 'AI'}
              </div>

              <div style={{
                maxWidth: '75%', padding: '12px 16px', fontSize: '14px', lineHeight: '1.5',
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
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fff', color: '#1677ff', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginRight: '12px', fontSize: '12px', flexShrink: 0 }}>AI</div>
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