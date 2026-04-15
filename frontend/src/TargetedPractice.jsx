import React, { useState } from 'react';

// 🎯 靶向训练组件
const TargetedPractice = ({ errorContext, suggestion = "" }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizData, setQuizData] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);

  const handleGenerateClick = async () => {
    if (!errorContext) return;

    setIsGenerating(true);
    setQuizData([]);
    setUserAnswers({});
    setShowResults(false);

    try {
      const response = await fetch('/api/generate_practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: "demo",
          error_context: errorContext,
          suggestion: suggestion
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        // 🌟 核心破案点：增强前端的包容性，兼容各种奇葩结构
        let questions = [];
        const resData = result.data;

        if (Array.isArray(resData)) {
          questions = resData; // 格式 1: 直接是数组 [...]
        } else if (resData && Array.isArray(resData.questions)) {
          questions = resData.questions; // 格式 2: 包在 questions 里的数组
        } else if (resData && resData.question) {
          questions = [resData]; // 🌟 格式 3 (你遇到的情况): 单个题目对象，我们手动给它包一层数组！
        }

        if (questions.length === 0) {
          alert("⚠️ AI 未能生成有效题目，请重试。");
        } else {
          setQuizData(questions);
        }
      } else {
        alert("❌ 生成题目失败：" + (result.message || "未知错误"));
      }
    } catch (error) {
      console.error("请求出题接口失败:", error);
      alert("❌ 网络连接失败，请检查后端服务是否正常运行。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptionSelect = (qIndex, optString) => {
    if (showResults) return;
    setUserAnswers(prev => ({ ...prev, [qIndex]: optString }));
  };

  return (
    <div style={{ marginTop: '15px', padding: '15px', border: '1px dashed #1890ff', borderRadius: '8px', backgroundColor: '#fafafa' }}>

      {!isGenerating && quizData.length === 0 && (
        <button
          onClick={handleGenerateClick}
          style={{
            background: 'linear-gradient(90deg, #1890ff, #722ed1)',
            color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 14px rgba(114, 46, 209, 0.4)'
          }}
        >
          ✨ 攻克此薄弱点 (AI 实时生成靶向练习)
        </button>
      )}

      {isGenerating && (
        <div style={{ color: '#1890ff', fontWeight: '500' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1.5s linear infinite', marginRight: '8px' }}>⚙️</span>
          A25 正在分析你的薄弱点，生成专属题目...
        </div>
      )}

      {quizData.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontWeight: 'bold', color: '#0958d9', marginBottom: '16px', fontSize: '15px' }}>
            📚 AI 靶向巩固练习 (共 {quizData.length} 题)
          </div>

          {quizData.map((q, qIndex) => (
            <div key={qIndex} style={{ marginBottom: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e8e8e8' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#333', whiteSpace: 'pre-wrap' }}>{qIndex + 1}. {q.question}</h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {q.options.map((opt, optIndex) => {
                  const isSelected = userAnswers[qIndex] === opt;
                  // 严谨判断答案
                  const isCorrectAnswer = showResults && (opt.startsWith(q.answer) || opt === q.answer || (q.answer.length === 1 && opt.includes(q.answer)));
                  const isWrongSelection = showResults && isSelected && !isCorrectAnswer;

                  let bgColor = '#fff';
                  let borderColor = '#d9d9d9';

                  if (isSelected) {
                    bgColor = '#e6f7ff';
                    borderColor = '#1890ff';
                  }

                  if (showResults) {
                    if (isCorrectAnswer) {
                      bgColor = '#f6ffed'; borderColor = '#52c41a';
                    } else if (isWrongSelection) {
                      bgColor = '#fff2f0'; borderColor = '#ff4d4f';
                    }
                  }

                  return (
                    <div
                      key={optIndex}
                      onClick={() => handleOptionSelect(qIndex, opt)}
                      style={{
                        padding: '10px 16px', border: `1px solid ${borderColor}`, borderRadius: '6px',
                        cursor: showResults ? 'default' : 'pointer',
                        backgroundColor: bgColor, transition: 'all 0.3s',
                        color: (showResults && isCorrectAnswer) ? '#389e0d' : (showResults && isWrongSelection ? '#cf1322' : '#333'),
                        fontWeight: (showResults && isCorrectAnswer) ? 'bold' : 'normal'
                      }}
                    >
                      {opt}
                      {showResults && isCorrectAnswer && <span style={{ float: 'right' }}>✅</span>}
                      {showResults && isWrongSelection && <span style={{ float: 'right' }}>❌</span>}
                    </div>
                  );
                })}
              </div>

              {/* 🌟 兼容 explanation 和 analysis 两个字段 */}
              {showResults && (q.explanation || q.analysis) && (
                <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#e6f7ff', borderRadius: '6px', color: '#096dd9', borderLeft: '3px solid #1890ff' }}>
                  <strong>💡 AI 深度解析：</strong>{q.explanation || q.analysis}
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
             {!showResults ? (
               <button
                 onClick={() => setShowResults(true)}
                 disabled={Object.keys(userAnswers).length !== quizData.length}
                 style={{
                   padding: '8px 24px',
                   backgroundColor: Object.keys(userAnswers).length === quizData.length ? '#1890ff' : '#ccc',
                   color: '#fff', border: 'none', borderRadius: '6px',
                   cursor: Object.keys(userAnswers).length === quizData.length ? 'pointer' : 'not-allowed',
                   fontWeight: 'bold'
                 }}
               >
                 交卷看解析
               </button>
             ) : (
               <button
                 onClick={handleGenerateClick}
                 style={{ padding: '8px 16px', backgroundColor: '#fff', border: '1px solid #1890ff', color: '#1890ff', borderRadius: '6px', cursor: 'pointer' }}
               >
                 🔄 换一批题
               </button>
             )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default TargetedPractice;