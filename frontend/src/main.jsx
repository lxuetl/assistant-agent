import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import UserPortal from './platform.jsx' // 引入你的独立中台页面

// 🌟 核心魔法：读取网址里的参数
const urlParams = new URLSearchParams(window.location.search);
const page = urlParams.get('page');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 🌟 逻辑反转：
        如果网址专门带了 ?page=widget（我们在学习通里嵌入时用这个），就渲染悬浮球 App
        如果没带（默认情况，你直接跑 npm run dev 打开时），就渲染霸气的中台大盘 UserPortal */}
    {page === 'widget' ? <App /> : <UserPortal />}
  </StrictMode>,
)