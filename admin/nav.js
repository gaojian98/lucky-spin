// 检查权限 - 只在非登录页执行
function checkAdminAuth() {
    const currentPage = window.location.pathname.split('/').pop();
    const token = localStorage.getItem('adminToken');
    
    console.log('🔍 权限检查:');
    console.log('  当前页面:', currentPage);
    console.log('  Token:', token ? '✅ 存在' : '❌ 不存在');
    
    // 登录页不需要检查
    if (currentPage === 'index.html' || currentPage === '' || currentPage === 'admin/') {
        console.log('  → 登录页，跳过检查');
        return;
    }
    
    if (!token) {
        console.log('  → 无 Token，重定向到登录页');
        window.location.href = 'index.html';
    } else {
        console.log('  → ✅ 权限验证通过');
    }
}

// 创建统一导航菜单
function createNavigation() {
    const adminUser = localStorage.getItem('adminUser') || '管理员';
    const nav = document.createElement('nav');
    nav.innerHTML = `
        <style>
            nav {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 0;
                margin: 0 0 20px 0;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .nav-container {
                max-width: 1200px;
                margin: 0 auto;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0 20px;
            }
            .nav-brand {
                color: white;
                font-size: 1.3rem;
                font-weight: bold;
                text-decoration: none;
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 15px 0;
            }
            .nav-menu {
                display: flex;
                gap: 0;
                list-style: none;
                margin: 0;
                padding: 0;
                flex-wrap: wrap;
            }
            .nav-menu li { margin: 0; }
            .nav-menu a {
                color: white;
                text-decoration: none;
                padding: 15px 16px;
                display: block;
                transition: background 0.3s;
                border-bottom: 3px solid transparent;
                font-size: 0.95rem;
            }
            .nav-menu a:hover,
            .nav-menu a.active {
                background: rgba(255,255,255,0.1);
                border-bottom-color: white;
            }
            .nav-user {
                color: white;
                display: flex;
                align-items: center;
                gap: 15px;
                margin-left: auto;
            }
            .nav-user span {
                font-size: 0.9rem;
                white-space: nowrap;
            }
            .btn-logout {
                background: rgba(255,255,255,0.2);
                color: white;
                border: 1px solid white;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                transition: 0.3s;
                font-weight: 500;
                white-space: nowrap;
            }
            .btn-logout:hover { background: rgba(255,255,255,0.3); }
        </style>
        <div class="nav-container">
            <a href="dashboard.html" class="nav-brand">🎉 Lucky Spin</a>
            <ul class="nav-menu">
                <li><a href="dashboard.html">📊 首页</a></li>
                <li><a href="users.html">👥 用户</a></li>
                <li><a href="managers.html">👨‍💼 审核</a></li>
                <li><a href="config.html">⚙️ 配置</a></li>
                <li><a href="stats.html">📈 统计</a></li>
                <li><a href="payment-accounts.html">💳 收款</a></li>
            </ul>
            <div class="nav-user">
                <span>👤 ${adminUser}</span>
                <button class="btn-logout" onclick="logoutAdmin()">退出</button>
            </div>
        </div>
    `;
    document.body.insertBefore(nav, document.body.firstChild);
    setCurrentPageActive();
}

function setCurrentPageActive() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-menu a').forEach(a => {
        if (a.getAttribute('href') === currentPage || 
            (currentPage === '' && a.getAttribute('href') === 'index.html')) {
            a.classList.add('active');
        }
    });
}

function logoutAdmin() {
    if (confirm('确定要退出登录吗?')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = 'index.html';
    }
}

// 页面加载完后执行权限检查
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();
    
    // 登录页不加载导航
    if (currentPage !== 'index.html' && currentPage !== '') {
        checkAdminAuth();
        createNavigation();
    }
});
