import React, { useState } from 'react';

export default function UserPortal() {
  const [activeTab, setActiveTab] = useState('report'); // 默认选中学情报告

  // 👇 用于作业批改的几个核心状态
  const [questionText, setQuestionText] = useState(''); // 存原题
  const [fileData, setFileData] = useState(null);       // 存文件内容 (Base64 或 纯文本)
  const [fileType, setFileType] = useState('');         // 存文件类型 ('image', 'text', 'docx')
  const [isGrading, setIsGrading] = useState(false);    // 批改中加载状态
  const [gradingResult, setGradingResult] = useState(null); // 存 AI 返回的结果
  const [annotatedFile, setAnnotatedFile] = useState(null); // 🌟 新增：存后端传回来的带批注的 Word 文件流

  // 页面跳转函数
  const jumpToPlatform = (url) => {
    window.open(url, '_blank');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f5f7fa', fontFamily: 'sans-serif' }}>

      {/* 👈 左侧：第三方平台转接枢纽 */}
      <div style={{ width: '240px', backgroundColor: '#fff', borderRight: '1px solid #ebeef5', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', fontSize: '20px', fontWeight: 'bold', color: '#1677ff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '24px', marginRight: '8px' }}>🎓</span> A25 学习中心
        </div>

        <div style={{ padding: '20px', flex: 1 }}>
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#999', fontWeight: 'bold' }}>我的教学平台</div>
          <button onClick={() => jumpToPlatform('https://i.chaoxing.com/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>📘 超星学习通</button>
          <button onClick={() => jumpToPlatform('https://www.yuketang.cn/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>🌂 雨课堂</button>
          <button onClick={() => jumpToPlatform('https://www.zhihuishu.com/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>🌳 智慧树</button>
        </div>

        {/* 底部用户信息 */}
        <div style={{ padding: '20px', borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#1677ff', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', marginRight: '12px' }}>李</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>李同学</div>
            <div style={{ fontSize: '12px', color: '#999' }}>计算机科学与技术</div>
          </div>
        </div>
      </div>

      {/* 👉 右侧：A25 主功能区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 顶部导航 Tabs */}
        <div style={{ height: '64px', backgroundColor: '#fff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center', padding: '0 32px', gap: '32px', flexShrink: 0 }}>
          {[
            { id: 'report', label: '📊 学情报告' },
            { id: 'grading', label: '📝 作业批改' },
            { id: 'agent', label: '🤖 AI 辅导助手' }
          ].map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ cursor: 'pointer', fontWeight: activeTab === tab.id ? 'bold' : 'normal', color: activeTab === tab.id ? '#1677ff' : '#666', borderBottom: activeTab === tab.id ? '3px solid #1677ff' : '3px solid transparent', padding: '20px 0', transition: 'all 0.2s' }}>
              {tab.label}
            </div>
          ))}
        </div>

        {/* 动态内容展示区 */}
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>

          {activeTab === 'report' && (
             <div style={{ animation: 'fadeIn 0.3s' }}>
             <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>近期学习跨度分析</h2>
             <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
               <p style={{ color: '#666', marginBottom: '16px' }}>系统检测到你在《C++程序设计》与《数据结构》中存在关联性知识薄弱点。</p>
               <div style={{ height: '200px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999', border: '1px dashed #d9d9d9' }}>
                 [ 这里预留给雷达图或折线图组件 ]
               </div>
             </div>
           </div>
          )}

          {/* 🌟 核心替换：全新升级的作业批改功能区 */}
          {activeTab === 'grading' && (
            <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px' }}>
              <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>智能作业批注系统</h2>

              <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

                {/* 1. 全新升级：原题输入与文档解析区 */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>1</span>
                      请输入原题内容，或上传题目文档：
                    </div>

                    {/* 自动提取 Word / PDF 按钮 */}
                    <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                      <button style={{ padding: '6px 12px', backgroundColor: '#f0f2f5', border: '1px solid #d9d9d9', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#666', transition: 'all 0.3s' }}>
                        📎 自动提取 Word / PDF
                      </button>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        title="上传题目文档"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;

                          setQuestionText("正在拼命读取文档内容，请稍候...");

                          const formData = new FormData();
                          formData.append('file', file);

                          try {
                            const res = await fetch('http://localhost:8000/api/parse_question_file', {
                              method: 'POST',
                              body: formData
                            });
                            const data = await res.json();
                            if (data.status === 'success') {
                              setQuestionText(data.text);
                            } else {
                              alert("解析失败：" + data.error);
                              setQuestionText("");
                            }
                          } catch (err) {
                            alert("网络错误，请确保后端服务已启动！");
                            setQuestionText("");
                          }
                          e.target.value = null;
                        }}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="例如：请用 C++ 实现一个快速排序算法...（你也可以点击右上角按钮直接上传老师发的作业文档）"
                    style={{ width: '100%', height: '120px', padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>

                {/* 2. 解答上传区 */}
                <div>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>2</span>
                    上传你的解答（支持图片、代码或 Word 文档）：
                  </div>

                  <div style={{ border: '2px dashed #1677ff', backgroundColor: fileData ? '#f6ffed' : '#e6f4ff', borderRadius: '12px', padding: '30px', textAlign: 'center', position: 'relative' }}>
                    <input
                      type="file"
                      accept="image/*,.c,.cpp,.py,.txt,.docx"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();

                        // 🌟 核心修改：拦截 .docx 并用 DataURL (Base64) 形式读取
                        if (file.type.startsWith('image/')) {
                          setFileType('image');
                          reader.readAsDataURL(file);
                          reader.onload = () => setFileData(reader.result);
                        } else if (file.name.endsWith('.docx')) {
                          setFileType('docx');
                          reader.readAsDataURL(file);
                          reader.onload = () => setFileData(reader.result);
                        } else {
                          // 其他普通代码文件当做纯文本读取
                          setFileType('text');
                          reader.readAsText(file);
                          reader.onload = () => setFileData(reader.result);
                        }
                      }}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '40px' }}>{fileData ? '✅' : '📤'}</span>
                    <h3 style={{ margin: '16px 0 8px 0', color: fileData ? '#52c41a' : '#1677ff' }}>
                      {fileData ? '文件已就绪，可点击重新选择' : '点击此处选择你的作业文件'}
                    </h3>
                  </div>
                </div>

                {/* 3. 提交按钮 */}
                <button
                  disabled={!questionText || !fileData || isGrading}
                  onClick={async () => {
                    setIsGrading(true);
                    setGradingResult(null); // 清空上次成绩卡片
                    setAnnotatedFile(null); // 🌟 清空上次的文件缓存

                    try {
                      const res = await fetch('http://localhost:8000/api/grade_homework', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          user_id: "student_001",
                          course_id: "计算机科学",
                          question_text: questionText,
                          content_type: fileType,
                          content: fileData
                        })
                      });
                      const data = await res.json();
                      if (data.status === 'success') {
                         setGradingResult(JSON.parse(data.grading_result));

                         // 🌟 如果后端吐出了批注好的 Word 字节流，存进状态里！
                         if (data.annotated_file) {
                             setAnnotatedFile(data.annotated_file);
                         }
                      } else {
                         alert("批改出错：" + JSON.stringify(data));
                      }
                    } catch (err) {
                      console.error(err);
                      alert("请求失败，请确保 FastAPI 后端在 8000 端口运行！");
                    } finally {
                      setIsGrading(false);
                    }
                  }}
                  style={{ width: '100%', marginTop: '32px', padding: '14px 0', backgroundColor: (questionText && fileData && !isGrading) ? '#1677ff' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: (questionText && fileData && !isGrading) ? 'pointer' : 'not-allowed', boxShadow: '0 4px 12px rgba(22,119,255,0.3)' }}
                >
                  {isGrading ? '⏳ AI 教授正在深度审阅中...' : '✨ 开始 AI 智能批注'}
                </button>

              </div>

              {/* 4. 批改结果展示单 */}
              {gradingResult && (
                <div style={{ marginTop: '24px', backgroundColor: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #b7eb8f', borderTop: '6px solid #52c41a', boxShadow: '0 4px 12px rgba(82,196,26,0.1)', animation: 'fadeIn 0.5s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, color: '#333' }}>批改报告单</h2>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#52c41a' }}>{gradingResult.overall_score} <span style={{fontSize:'16px', color:'#999'}}>分</span></div>
                  </div>
                  <p style={{ fontSize: '16px', color: '#555', backgroundColor: '#f6ffed', padding: '12px 16px', borderRadius: '8px' }}>
                    <strong>👨‍🏫 教授点评：</strong>{gradingResult.summary}
                  </p>

                  <h3 style={{ marginTop: '24px', color: '#333', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>📝 细节批注：</h3>
                  {gradingResult.annotations.map((ann, idx) => (
                    <div key={idx} style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fffaf0', borderLeft: '4px solid #faad14', borderRadius: '0 8px 8px 0' }}>
                      <div style={{ fontWeight: 'bold', color: '#d46b08', marginBottom: '8px' }}>
                        📍 {ann.location} <span style={{ fontSize: '12px', backgroundColor: '#faad14', color: '#fff', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px' }}>{ann.error_type}</span>
                      </div>
                      <div style={{ color: '#cf1322', marginBottom: '8px', fontSize: '14px' }}><strong>❌ 问题分析：</strong>{ann.explanation}</div>
                      <div style={{ color: '#08979c', fontSize: '14px' }}><strong>💡 修改建议：</strong>{ann.suggestion}</div>
                    </div>
                  ))}

                  {/* 🌟 下载原生批注按钮 */}
                  {annotatedFile && (
                    <button
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = annotatedFile;
                        a.download = 'A25智能批改报告.docx';
                        a.click();
                      }}
                      style={{ marginTop: '24px', padding: '12px 24px', width: '100%', backgroundColor: '#52c41a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.3s', boxShadow: '0 4px 12px rgba(82,196,26,0.3)' }}
                    >
                      📥 下载带有 AI 批注的原生 Word 文档
                    </button>
                  )}

                </div>
              )}

            </div>
          )}

          {activeTab === 'agent' && (
             <div style={{ animation: 'fadeIn 0.3s' }}>
             <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>专属答疑空间</h2>
             <div style={{ backgroundColor: '#fff', height: '400px', borderRadius: '12px', border: '1px solid #ebeef5', display: 'flex', flexDirection: 'column', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
               <div style={{ flex: 1, color: '#999', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                 [ 对话记录区域 ]
               </div>
               <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                 <input type="text" placeholder="输入你想问的课程问题..." style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #d9d9d9', outline: 'none' }} />
                 <button style={{ padding: '0 24px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>发送</button>
               </div>
             </div>
           </div>
          )}

        </div>
      </div>
    </div>
  );
}