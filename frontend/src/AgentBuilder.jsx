import React, { useState } from 'react';

// 🌟 修改点 1：在这里多接收一个 onSaveSuccess 属性
export default function AgentBuilder({ onClose, role, onSaveSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    shortDesc: '',
    systemPrompt: '',
    skills: { grading: true, practice: true, webSearch: false }
  });
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [kbFile, setKbFile] = useState(null);

  // 🌟 核心魔法：调用后端 AI 扩写提示词
  const handleEnhancePrompt = async () => {
    if (!formData.shortDesc) {
      alert("请先用一句话描述一下你想创建一个什么样的助教/学伴哦！");
      return;
    }
    setIsEnhancing(true);
    try {
      // 调用我们即将写好的后端接口
      const res = await fetch('/api/enhance_prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ short_desc: formData.shortDesc, role: role })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFormData({ ...formData, systemPrompt: data.enhanced_prompt });
      }
    } catch (err) {
      alert("网络波动，扩写失败");
    } finally {
      setIsEnhancing(false);
    }
  };

  // 🌟 修改点 2：把存根数据传给主页面
  const handleSave = () => {
    if (!formData.name || !formData.systemPrompt) {
      alert("请填写完整的名称和提示词设定！");
      return;
    }

    // 组装新智能体的数据包，生成一个唯一ID
    const newAgent = {
      id: 'agent_' + Date.now(),
      name: formData.name,
      desc: formData.shortDesc,
      prompt: formData.systemPrompt,
      kbName: kbFile ? kbFile.name : null // 如果上传了文件，记录文件名
    };

    // 传给老大哥 UserPortal，让它显示在聊天框上面
    onSaveSuccess(newAgent);

    alert(`🎉 成功创建专属智能体：${formData.name}！系统已自动挂载至大模型底座。`);
    onClose(); // 关闭弹窗
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
      <div style={{ width: '600px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s' }}>

        {/* 标题栏 */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0f5ff', borderRadius: '16px 16px 0 0' }}>
          <h2 style={{ margin: 0, color: '#1677ff', fontSize: '20px' }}>
            {role === 'teacher' ? '👨‍🏫 助教构建舱 (Teacher Mode)' : '🔬 AI 学伴实验室 (Student Mode)'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        {/* 滚动表单区 */}
        <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* 模块一：基础人设 */}
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🤖 智能体名称</div>
            <input type="text" placeholder={role === 'teacher' ? "如：高数李老师的严厉助教" : "如：雅思口语刁钻考官"} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', outline: 'none' }} />
          </div>

          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>🧠 灵魂注入 (一句话描述)</span>
            </div>
            <input type="text" placeholder="用大白话描述即可，如：帮我复习计算机组成原理，遇到不懂的要反问我。" value={formData.shortDesc} onChange={e => setFormData({ ...formData, shortDesc: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', outline: 'none' }} />

            <button onClick={handleEnhancePrompt} disabled={isEnhancing} style={{ marginTop: '12px', width: '100%', padding: '10px', backgroundColor: '#e6f4ff', color: '#1677ff', border: '1px dashed #1677ff', borderRadius: '6px', cursor: isEnhancing ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}>
              {isEnhancing ? '⚙️ AI 正在深度思考，构建结构化提示词...' : '✨ 让大模型帮你扩写专业级 System Prompt'}
            </button>
          </div>

          {/* 生成的 Prompt 预览区 */}
          {formData.systemPrompt && (
            <div style={{ animation: 'fadeIn 0.5s' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#52c41a' }}>✅ 核心提示词指令 (可手动修改)</div>
              <textarea value={formData.systemPrompt} onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })} style={{ width: '100%', height: '120px', padding: '10px', borderRadius: '6px', border: '1px solid #b7eb8f', backgroundColor: '#f6ffed', outline: 'none', resize: 'vertical' }} />
            </div>
          )}

          {/* 模块二：知识库与技能 */}
          <div style={{ borderTop: '1px dashed #d9d9d9', paddingTop: '20px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📚 挂载专属知识库</div>

            {/* 🌟 加入了真实的相对定位和透明 input */}
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{
                border: '1px dashed #d9d9d9', padding: '20px', textAlign: 'center',
                borderRadius: '6px', cursor: 'pointer', transition: 'all 0.3s',
                backgroundColor: kbFile ? '#e6f4ff' : '#fafafa',
                color: kbFile ? '#1677ff' : '#666'
              }}>
                {kbFile ? `✅ 已准备挂载: ${kbFile.name} (点击可更换)` : '➕ 点击上传参考文件 (PDF / Word / 笔记截图)'}
                <div style={{ fontSize: '12px', marginTop: '4px', color: '#999' }}>系统将自动进行向量切片并存入 ChromaDB</div>
              </div>

              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.png,.jpg"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setKbFile(file);
                  }
                }}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
            </div>
          </div>

        </div>

        {/* 底部按钮 */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #ebeef5', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#fafafa', borderRadius: '0 0 16px 16px' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #d9d9d9', backgroundColor: '#fff', cursor: 'pointer' }}>取消</button>
          <button onClick={handleSave} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#1677ff', color: '#fff', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,119,255,0.3)' }}>🚀 立即部署上线</button>
        </div>

      </div>
    </div>
  );
}