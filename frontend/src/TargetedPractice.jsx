import React, { useState } from 'react';

// 🎯 靶向训练组件：你可以把它嵌在每一个“错误批注”的下方
const TargetedPractice = ({ errorContext }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  // 模拟调用后端接口的过程
  const handleGenerateClick = () => {
    setIsGenerating(true);
    // 模拟大模型思考的 3 秒钟（这里以后换成真实的 fetch 请求）
    setTimeout(() => {
      setIsGenerating(false);
      setQuizData({
        question: "【针对性加练】在 Excel 高级筛选中，如果要筛选出成绩“及格”（满分100，60分及格）的同学，条件区域应填写？",
        options: ["A. >60", "B. >=60", "C. =60", "D. <60"],
        correct_answer: "B",
        analysis: "包含边界值至关重要，及格包含60分，必须使用 >= 运算符。这正是你刚才作业中疏忽的地方哦！"
      });
    }, 3000);
  };

  return (
    <div style={{ marginTop: '15px', padding: '15px', border: '1px dashed #1890ff', borderRadius: '8px', backgroundColor: '#fafafa' }}>

      {/* 阶段 1：展示触发按钮 */}
      {!isGenerating && !quizData && (
        <button
          onClick={handleGenerateClick}
          style={{
            background: 'linear-gradient(90deg, #1890ff, #722ed1)',
            color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 14px rgba(114, 46, 209, 0.4)'
          }}
        >
          ✨ 攻克此薄弱点 (生成靶向练习)
        </button>
      )}

      {/* 阶段 2：展示炫酷的加载动画 */}
      {isGenerating && (
        <div style={{ color: '#1890ff', fontWeight: '500' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1.5s linear infinite', marginRight: '8px' }}>⚙️</span>
          A25 正在分析你的薄弱点，翻阅课件生成专属题目...
        </div>
      )}

      {/* 阶段 3：展示题目和答题区 */}
      {quizData && (
        <div style={{ marginTop: '10px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>{quizData.question}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {quizData.options.map((opt, idx) => {
              const isCorrect = quizData.correct_answer === opt[0]; // 简单判断 A, B, C, D
              const isSelected = selectedAnswer === opt[0];

              let bgColor = '#fff';
              if (selectedAnswer) {
                if (isCorrect) bgColor = '#d9f7be'; // 绿色（正确）
                else if (isSelected) bgColor = '#ffa39e'; // 红色（选错）
              }

              return (
                <div
                  key={idx}
                  onClick={() => !selectedAnswer && setSelectedAnswer(opt[0])}
                  style={{
                    padding: '10px', border: '1px solid #d9d9d9', borderRadius: '6px',
                    cursor: selectedAnswer ? 'not-allowed' : 'pointer',
                    backgroundColor: bgColor, transition: 'all 0.3s'
                  }}
                >
                  {opt}
                </div>
              );
            })}
          </div>

          {/* 答题后的解析 */}
          {selectedAnswer && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e6f7ff', borderRadius: '6px', color: '#096dd9' }}>
              <strong>💡 AI 深度解析：</strong>{quizData.analysis}
            </div>
          )}
        </div>
      )}

      {/* 防止你刚才没加旋转动画，在这里补上 */}
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default TargetedPractice;