import { useState, useRef, useEffect } from 'react';

function App() {
  // ==============================================
  // 悬浮球 & 拖拽相关状态 (已重构为遥控模式)
  // ==============================================
  const [isExpanded, setIsExpanded] = useState(false); // 默认收起为悬浮球
  const isDraggingRef = useRef(false);
  const dragStartTime = useRef(0);
  const agentRef = useRef(null);

  // ==============================================
  // AI 聊天与出题核心状态
  // ==============================================
  const [input, setInput] = useState('');
  const [chatLog, setChatLog] = useState([
    { role: 'ai', content: '同学你好！我是 A25 跨课程智能助教，有什么我可以帮你的吗？' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageContext, setPageContext] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const messagesEndRef = useRef(null);

  // 监听网页发来的上下文
  useEffect(() => {
    console.log("🟢 A25 前端已挂载，正在等待接收网页上下文...");
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'A25_PAGE_CONTEXT') {
        setPageContext(event.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatLog, isExpanded]);

  // ==============================================
  // 拖拽逻辑：向父级 content.js 发送位移信号
  // ==============================================
  const handleMouseDown = (e) => {
    // 如果展开了，只有点头部导航栏才能拖拽
    if (isExpanded && !e.target.closest('.drag-handle')) return;

    dragStartTime.current = Date.now();
    isDraggingRef.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;

      // 🌟 核心魔法：直接把鼠标移动的距离发给老家 content.js，让它移动 iframe！
      window.parent.postMessage({
        type: 'A25_MOVE_DELTA',
        dx: e.movementX,
        dy: e.movementY
      }, '*');
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 点击悬浮球/缩小按钮切换状态（带防拖拽误触）+ 发送变形信号
  const toggleExpand = () => {
    const dragDuration = Date.now() - dragStartTime.current;
    if (dragDuration < 200) { // 短暂点击才算切换，长按算拖拽
      const nextState = !isExpanded;
      setIsExpanded(nextState);

      // 🌟 告诉老家 content.js：马上给我变大/变小！
      window.parent.postMessage({
        type: 'A25_RESIZE',
        width: nextState ? '380px' : '60px',
        height: nextState ? '600px' : '60px'
      }, '*');
    }
  };

  // ==============================================
  // 原有的出题与聊天逻辑（完全保持不变）
  // ==============================================
  const normalizeQuiz = (raw) => {
    if (!raw || raw.error) return raw;
    const question = raw.question || '';
    let options = raw.options || [];
    if (Array.isArray(options) && options.length && typeof options[0] === 'string') {
      options = options.map((line) => {
        const s = String(line).trim();
        const m = s.match(/^([A-Da-d])[\.\、\:\：]\s*(.+)$/);
        if (m) return { key: m[1].toUpperCase(), value: m[2] };
        if (s.length >= 2 && /^[A-Da-d]/.test(s[0])) return { key: s[0].toUpperCase(), value: s.slice(1).replace(/^[\.\、\:\：]\s*/, '') };
        return { key: s.slice(0, 1), value: s };
      });
    }
    const answer = raw.answer == null ? raw.answer : String(raw.answer).trim().toUpperCase().charAt(0);
    return { ...raw, question, options, answer };
  };

  const handleGenerateQuiz = async () => {
    if (!pageContext) { alert("还没抓取到课件内容，稍等一下哦！"); return; }
    setQuizLoading(true); setQuiz(null); setSelectedOption(null); setShowExplanation(false);
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_context: {
            title: pageContext.title,
            content: pageContext.content,
            images: pageContext.images,
            url: pageContext.url
          }
        })
      });
      const data = await response.json();
      if (data.error) alert(data.error); else setQuiz(normalizeQuiz(data));
    } catch (error) { console.error(error); alert("出题请求失败"); } finally { setQuizLoading(false); }
  };

  const handleCloseQuiz = () => {
    if (showExplanation && selectedOption && quiz) {
      const pick = (x) => String(x || '').trim().toUpperCase().charAt(0);
      const isCorrect = pick(selectedOption) === pick(quiz.answer);
      setChatLog(prev => [...prev,
        { role: 'user', content: `[系统记录] 我刚刚完成测试。\n题目：${quiz.question}\n我的回答：${selectedOption}（${isCorrect ? '正确 🎉' : '错误 ❌'}）` },
        { role: 'ai', content: isCorrect ? '太棒了！看来你对这部分知识掌握得很扎实！' : '没关系，错题是最好的老师！解析看懂了吗？' }
      ]);

      // 🌟 核心修改 1：保存错题记录时，带上用户和课程信息
      fetch('/api/save_quiz_record', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "student_888",      // 测试用 ID
          course_id: "math_101",       // 测试用课程 ID
          question: quiz.question,
          options: JSON.stringify(quiz.options),
          user_choice: selectedOption,
          correct_answer: quiz.answer,
          is_correct: isCorrect,
          explanation: quiz.explanation
        })
      }).catch(err => console.error("写入失败:", err));
    }
    setQuiz(null); setSelectedOption(null); setShowExplanation(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const currentInput = input.trim();
    setChatLog(prev => [...prev, { role: 'user', content: currentInput }, { role: 'ai', content: '' }]);
    setInput('');
    setIsLoading(true);

    const apiMessages = [...chatLog, { role: 'user', content: currentInput }].map((m) => ({
      role: m.role === 'user' ? 'user' : 'ai',
      content: m.content
    }));

    const embedPlatform =
      pageContext?.platform === 'yuketang'
        ? 'yuketang'
        : pageContext?.platform === 'chaoxing'
          ? 'chaoxing'
          : 'web';

    const requestBody = {
      user_id: 'student_888',
      course_id: 'math_101',
      platform: embedPlatform,
      messages: apiMessages
    };
    if (pageContext) {
      requestBody.page_context = {
        title: pageContext.title,
        content: pageContext.content,
        images: pageContext.images,
        url: pageContext.url
      };
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!res.ok || !res.body) throw new Error('bad response');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setChatLog((prev) => {
          const c = [...prev];
          c[c.length - 1].content = buf;
          return c;
        });
      }
    } catch {
      setChatLog((prev) => {
        const c = [...prev];
        c[c.length - 1].content = '连接超时';
        return c;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ==============================================
  // UI 渲染：去除了内部绝对定位，依赖外部 iframe 大小
  // ==============================================
  return (
    <div
      ref={agentRef}
      onMouseDown={handleMouseDown}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        userSelect: 'none',
        backgroundColor: 'transparent'
      }}
    >
      {!isExpanded ? (
        // 👇 收起状态：悬浮小球 👇
        <div
          onMouseUp={toggleExpand}
          style={{
            width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#1677ff',
            boxShadow: '0 4px 16px rgba(22, 119, 255, 0.4)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          AI
        </div>
      ) : (
        // 👇 展开状态：聊天面板 👇
        <div style={{
          width: '100%', height: '100%', backgroundColor: '#fff', borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.18)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)'
        }}>
          {/* 头部导航栏 (加上 .drag-handle 标志以允许拖拽) */}
          <div className="drag-handle" style={{
            backgroundColor: '#1677ff', padding: '16px', color: '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', cursor: 'grab'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#52c41a', marginRight: '8px' }}></div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>A25 智能助教 (在线)</h3>
            </div>
            {/* 收起按钮 */}
            <button
              onMouseUp={toggleExpand}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', padding: '0 5px' }}
              title="收起为悬浮球"
            >
              −
            </button>
          </div>

          {pageContext && (
            <div style={{ backgroundColor: '#e6f4ff', padding: '8px 16px', fontSize: '12px', color: '#1677ff', borderBottom: '1px solid #91caff', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '6px' }}>👁️</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pageContext.platform === 'yuketang' ? '【雨课堂】' : pageContext.platform === 'chaoxing' ? '【学习通】' : '【课件】'}
                AI 已获取: {pageContext.title}
              </span>
            </div>
          )}

          {pageContext && (
            <div style={{ padding: '10px 16px', backgroundColor: '#fff', borderBottom: '1px solid #ebeef5' }}>
              {!quiz && (
                <button onClick={handleGenerateQuiz} disabled={quizLoading} style={{ width: '100%', padding: '10px', backgroundColor: quizLoading ? '#d9d9d9' : '#52c41a', color: '#fff', border: 'none', borderRadius: '6px', cursor: quizLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                  {quizLoading ? "🧠 AI 正在查阅课件出题中..." : "📝 根据当前网页考考我"}
                </button>
              )}
              {quiz && (() => {
                const pick = (x) => String(x || '').trim().toUpperCase().charAt(0);
                const answeredCorrect = pick(selectedOption) === pick(quiz.answer);
                return (
                <div style={{ marginTop: '5px', padding: '15px', backgroundColor: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '8px', position: 'relative' }}>
                  <button onClick={handleCloseQuiz} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#999' }}>✖</button>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#333', paddingRight: '20px', lineHeight: '1.5' }}>{quiz.question}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {quiz.options.map((opt, idx) => {
                      const key = typeof opt === 'string'
                        ? (String(opt).trim().match(/^([A-Da-d])/)?.[1] || String(idx)).toUpperCase()
                        : String(opt.key).toUpperCase();
                      const text = typeof opt === 'string' ? String(opt).trim() : String(opt.value);
                      return (
                        <label key={key + idx} style={{ display: 'block', padding: '8px 10px', cursor: showExplanation ? 'default' : 'pointer', backgroundColor: selectedOption === key ? '#e6f4ff' : '#fff', border: `1px solid ${selectedOption === key ? '#91caff' : '#d9d9d9'}`, borderRadius: '6px', fontSize: '13px' }}>
                          <input type="radio" name="quizOption" value={key} onChange={() => setSelectedOption(key)} disabled={showExplanation} style={{ marginRight: '8px' }} />
                          <strong>{key}.</strong> {typeof opt === 'string' ? text.replace(/^[A-Da-d][\.\、\:\：]\s*/, '') : text}
                        </label>
                      );
                    })}
                  </div>
                  {!showExplanation && selectedOption && (
                    <button onClick={() => setShowExplanation(true)} style={{ marginTop: '15px', width: '100%', padding: '10px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>提交答案</button>
                  )}
                  {showExplanation && (
                    <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: answeredCorrect ? '#f6ffed' : '#fff2f0', border: `1px solid ${answeredCorrect ? '#b7eb8f' : '#ffccc7'}` }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: answeredCorrect ? '#389e0d' : '#cf1322' }}>{answeredCorrect ? "🎉 回答正确！" : `❌ 回答错误。正确答案是：${pick(quiz.answer)}`}</p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#555', lineHeight: '1.6' }}><strong>解析：</strong>{quiz.explanation}</p>
                      </div>
                      <button onClick={handleCloseQuiz} style={{ padding: '10px', backgroundColor: '#fff', border: '1px solid #1677ff', color: '#1677ff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>完成练习并继续对话</button>
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          )}

          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', backgroundColor: '#f5f7fa', userSelect: 'text' }}>
            {chatLog.map((msg, index) => (
              <div key={index} style={{ display: 'flex', marginBottom: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: msg.role === 'user' ? '#1677ff' : '#fff', color: msg.role === 'user' ? '#fff' : '#1677ff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '14px', fontWeight: 'bold', marginLeft: msg.role === 'user' ? '12px' : '0', marginRight: msg.role === 'user' ? '0' : '12px', flexShrink: 0 }}>
                  {msg.role === 'user' ? '我' : 'AI'}
                </div>
                <div style={{ maxWidth: '75%', padding: '12px 16px', fontSize: '14px', lineHeight: '1.5', backgroundColor: msg.role === 'user' ? '#1677ff' : '#fff', color: msg.role === 'user' ? '#fff' : '#333', borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
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

          <div style={{ padding: '12px 16px', backgroundColor: '#fff', borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
            <input style={{ flex: 1, padding: '10px 16px', borderRadius: '20px', border: '1px solid #dcdfe6', outline: 'none', backgroundColor: '#f5f7fa', fontSize: '14px' }} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="输入您的问题，按回车发送..." />
            <button onClick={sendMessage} disabled={isLoading || !input.trim()} style={{ marginLeft: '12px', padding: '10px 20px', borderRadius: '20px', backgroundColor: (isLoading || !input.trim()) ? '#a0c5e8' : '#1677ff', color: '#fff', border: 'none', cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>发送</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;