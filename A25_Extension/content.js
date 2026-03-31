/**
 * A25 智能助教 - 穿透版 Content Script (终极轮询版)
 * 逻辑：精准狙击 panView 核心课件区 + 轮询抓取动态加载的图片
 */

(function() {
    // --- 1. 防止在 A25 侧边栏内部再次运行，避免无限递归 ---
    if (window.location.href.includes('cpolar')) return;

    // --- 2. 顶级窗口逻辑：负责创建侧边栏 + 接收情报并转发 ---
    if (window === window.top) {
        console.log("🚀 A25 总指挥部（Top Window）启动...");

        if (!document.getElementById('a25-sidebar')) {
            // 创建侧边栏
            const sidebar = document.createElement('iframe');
            sidebar.id = 'a25-sidebar';
            sidebar.src = 'https://2f553b10.r3.cpolar.top'; // 你的 A25 前端地址
            sidebar.style.cssText = 'position:fixed; top:0; right:0; width:380px; height:100vh; z-index:2147483647; border:none; box-shadow:-5px 0 20px rgba(0,0,0,0.15); background:#fff; transition: width 0.3s;';
            document.body.appendChild(sidebar);

            // 监听来自底下各层 iframe (间谍) 的汇报
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'A25_SUB_FRAME_REPORT') {
                    console.log(`📡 收到核心 Frame 情报: ${event.data.data.title}`);
                    
                    // 立即转发给 React 侧边栏
                    sidebar.contentWindow.postMessage({
                        type: 'A25_PAGE_CONTEXT',
                        ...event.data.data
                    }, '*');
                }
            });
        }
    }

    // --- 3. 潜伏间谍逻辑：死缠烂打的轮询抓取 ---
    // 🎯 身份查验：当前环境是不是在装有课件的 pan-yz iframe 里？
    const isPanView = window.location.href.includes('pan-yz.chaoxing.com');

    if (isPanView) {
        console.log("🎯 成功潜伏进入 panView 核心区域！启动雷达扫描...");
        
        let attempts = 0;
        // 设置一个定时器，每 1000 毫秒（1秒）扫描一次页面，最多扫 15 次
        const radar = setInterval(() => {
            attempts++;
            
            // 找当前 frame 里的所有 img 标签
            const pageImgs = document.querySelectorAll('img');
            
            // 只要发现有图片加载出来了！
            if (pageImgs.length > 0) {
                console.log(`📸 突围成功！在第 ${attempts} 秒抓到了 ${pageImgs.length} 张图片！`);
                
                let images = [];
                pageImgs.forEach((img, index) => {
                    // 拿前3张，防止传给大模型的数据太大撑爆
                    if (index < 3) { 
                        const src = img.src || img.getAttribute('data-src');
                        if (src && src.startsWith('http')) {
                            images.push(src);
                        }
                    }
                });

                // 提取隐藏的课件名字（如果没有，就用网页 title）
                const hiddenTitleInput = document.getElementById('fileInfoNameInput');
                const fileTitle = hiddenTitleInput && hiddenTitleInput.value ? hiddenTitleInput.value : document.title;

                // 立即向最顶层的总指挥部上报！
                window.top.postMessage({
                    type: 'A25_SUB_FRAME_REPORT',
                    data: {
                        title: "📄 核心课件: " + fileTitle,
                        content: `[系统提示] 这是截取的课件图片，AI已获取视觉画面。`,
                        images: images,
                        url: window.location.href
                    }
                }, '*');

                // 任务完成，关闭雷达，不用再找了
                clearInterval(radar);
                
            } else if (attempts > 15) {
                // 如果找了 15 秒还没图，说明真没有图或者是纯文本，撤退
                console.log("❌ 扫描 15 秒超时，未发现图片。");
                clearInterval(radar);
            }
        }, 1000); 

    } else {
        // 🤫 目录、侧边栏、导航栏等闲杂人等，一律闭嘴！
        // console.log("🤫 当前不是课件核心区，保持静默...");
    }

})();