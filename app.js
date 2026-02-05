// app.js - 车辆油品管理系统核心逻辑
// 重要：使用前需要在Supabase创建数据表并配置以下信息

// ========== 配置区域（必须修改！）==========
const SUPABASE_URL = 'https://kmcsnzppjxpnhhsmlfsk.supabase.co'; // 替换为你的Supabase URL
const SUPABASE_ANON_KEY = 'sb_publishable_TBGGSgpCSoyUm5iQ1kLuoA_rh3U3x3E'; // 替换为你的Supabase Anon Key
// =========================================

// 全局变量
let blackOilData = [];
let gearOilData = [];
let predictionData = [];
let supabaseClient = null;
let autoRefreshInterval = null;
let autoRefreshEnabled = false;

// 初始化函数
document.addEventListener('DOMContentLoaded', async function() {
    console.log('系统初始化...');
    
    // 初始化Supabase客户端
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase客户端已初始化');
    } else {
        console.error('Supabase配置不完整，将使用本地模拟数据');
        showNotification('未连接云端数据库，使用本地演示模式', 'warning');
    }
    
    // 初始化界面
    initTabs();
    initEventListeners();
    
    // 尝试从云端加载数据，失败则使用模拟数据
    try {
        await loadAllData();
    } catch (error) {
        console.error('数据加载失败:', error);
        // 使用模拟数据作为后备
        loadMockData();
    }
    
    // 初始化通知徽章
    updateNotificationBadge();
    
    // 设置自动刷新（每30秒）
    setInterval(() => {
        if (autoRefreshEnabled) {
            refreshData();
        }
    }, 30000);
    
    console.log('系统初始化完成');
});

// ========== 数据操作函数 ==========

// 从云端加载所有数据
async function loadAllData() {
    if (!supabaseClient) {
        throw new Error('Supabase客户端未初始化');
    }
    
    try {
        // 并行加载所有数据
        const [blackResult, gearResult, predictionResult] = await Promise.all([
            loadBlackOilData(),
            loadGearOilData(),
            loadPredictionData()
        ]);
        
        blackOilData = blackResult;
        gearOilData = gearResult;
        predictionData = predictionResult;
        
        // 更新界面
        initBlackOilTable();
        initGearOilTable();
        initPredictionTable();
        
        showNotification('数据加载成功', 'success');
        return true;
    } catch (error) {
        console.error('加载数据失败:', error);
        showNotification('数据加载失败: ' + error.message, 'error');
        throw error;
    }
}

// 加载黑油数据
async function loadBlackOilData() {
    if (!supabaseClient) {
        // 返回模拟数据
        return getMockBlackOilData();
    }
    
    const { data, error } = await supabaseClient
        .from('black_oil')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 加载齿轮油数据
async function loadGearOilData() {
    if (!supabaseClient) {
        return getMockGearOilData();
    }
    
    const { data, error } = await supabaseClient
        .from('gear_oil')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 加载预测数据
async function loadPredictionData() {
    if (!supabaseClient) {
        return getMockPredictionData();
    }
    
    const { data, error } = await supabaseClient
        .from('predictions')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 保存黑油数据行
async function saveBlackOilRow(rowData, isNew = false) {
    if (!supabaseClient) {
        // 本地模拟
        if (isNew) {
            rowData.id = Date.now();
            blackOilData.unshift(rowData);
        } else {
            const index = blackOilData.findIndex(item => item.id === rowData.id);
            if (index !== -1) blackOilData[index] = rowData;
        }
        initBlackOilTable();
        showNotification('数据已保存(本地模式)', 'success');
        return rowData;
    }
    
    try {
        let result;
        if (isNew) {
            // 删除id属性，让数据库自动生成
            delete rowData.id;
            const { data, error } = await supabaseClient
                .from('black_oil')
                .insert([rowData])
                .select();
            
            if (error) throw error;
            result = data[0];
            showNotification('黑油记录已添加', 'success');
        } else {
            const { data, error } = await supabaseClient
                .from('black_oil')
                .update(rowData)
                .eq('id', rowData.id)
                .select();
            
            if (error) throw error;
            result = data[0];
            showNotification('黑油记录已更新', 'success');
        }
        
        // 重新加载数据
        await loadAllData();
        return result;
    } catch (error) {
        console.error('保存黑油数据失败:', error);
        showNotification('保存失败: ' + error.message, 'error');
        throw error;
    }
}

// 删除黑油数据行
async function deleteBlackOilRow(rowId) {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    if (!supabaseClient) {
        // 本地模拟
        blackOilData = blackOilData.filter(item => item.id !== rowId);
        initBlackOilTable();
        showNotification('记录已删除(本地模式)', 'success');
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('black_oil')
            .delete()
            .eq('id', rowId);
        
        if (error) throw error;
        
        showNotification('黑油记录已删除', 'success');
        await loadAllData(); // 重新加载数据
    } catch (error) {
        console.error('删除黑油数据失败:', error);
        showNotification('删除失败: ' + error.message, 'error');
    }
}

// ========== 界面初始化函数 ==========

// 初始化选项卡
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // 移除所有活动的标签和内容
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 激活当前标签和内容
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // 特殊标签页处理
            if (targetTab === 'alerts') {
                updateAlertsDisplay();
            }
        });
    });
}

// 初始化黑油表格
function initBlackOilTable() {
    const tbody = document.getElementById('blackOilBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    blackOilData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', item.id || index);
        
        // 设置行颜色
        const rowColor = getBlackOilRowColor(item.remaining_mileage, item.update_date);
        if (rowColor) row.style.backgroundColor = rowColor;
        
        // 计算剩余里程（如果未提供）
        const remaining = item.remaining_mileage || 
                         (item.total_mileage && item.consumed_mileage ? 
                          item.total_mileage - item.consumed_mileage : 0);
        
        row.innerHTML = `
            <td data-label="车牌号">
                <input type="text" class="plate-input" value="${item.plate_number || ''}" 
                       data-field="plate_number" onchange="updateBlackOilField(this, ${item.id || index})">
            </td>
            <td data-label="下次保养">
                <input type="date" value="${formatDateForInput(item.next_service)}" 
                       data-field="next_service" onchange="updateBlackOilField(this, ${item.id || index})">
            </td>
            <td data-label="总里程">
                <input type="number" min="0" value="${item.total_mileage || 0}" 
                       data-field="total_mileage" onchange="updateBlackOilField(this, ${item.id || index}, true)">
            </td>
            <td data-label="录入日期">
                <input type="date" value="${formatDateForInput(item.entry_date)}" 
                       data-field="entry_date" onchange="updateBlackOilField(this, ${item.id || index})">
            </td>
            <td data-label="消耗里程">
                <input type="number" min="0" value="${item.consumed_mileage || 0}" 
                       data-field="consumed_mileage" onchange="updateBlackOilField(this, ${item.id || index}, true)">
            </td>
            <td data-label="更新日期">
                <input type="date" value="${formatDateForInput(item.update_date)}" 
                       data-field="update_date" onchange="updateBlackOilField(this, ${item.id || index})">
            </td>
            <td data-label="剩余里程">
                <span class="status-badge ${getRemainingStatusClass(remaining, 'black')}">
                    ${remaining} km
                </span>
            </td>
            <td data-label="操作">
                <button class="btn btn-danger btn-sm" onclick="deleteBlackOilRow(${item.id || index})">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // 如果没有数据，显示提示
    if (blackOilData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 30px;">
                    <i class="fas fa-inbox" style="font-size: 2rem; color: #ccc; margin-bottom: 10px; display: block;"></i>
                    <p>暂无黑油数据</p>
                    <button class="btn btn-primary" onclick="addBlackOilRow()">
                        <i class="fas fa-plus"></i> 添加第一条记录
                    </button>
                </td>
            </tr>
        `;
    }
}

// 更新黑油字段（简化版，实际需要调用saveBlackOilRow）
async function updateBlackOilField(input, rowId, isMileageField = false) {
    const field = input.getAttribute('data-field');
    const value = input.value;
    
    // 找到对应数据项
    let itemIndex = blackOilData.findIndex(item => (item.id || item.tempId) === rowId);
    if (itemIndex === -1) return;
    
    let item = blackOilData[itemIndex];
    const oldValue = item[field];
    
    // 特殊字段验证
    if (isMileageField) {
        if (!validateMileage(value)) {
            input.value = oldValue;
            showNotification('里程必须为正数', 'error');
            return;
        }
        
        // 如果是消耗里程且小于原值，需要确认
        if (field === 'consumed_mileage' && parseFloat(value) < parseFloat(oldValue || 0)) {
            if (!confirm(`确定要将消耗里程从 ${oldValue} 减少到 ${value} 吗？`)) {
                input.value = oldValue;
                return;
            }
        }
        
        // 如果是总里程或消耗里程，重新计算剩余里程
        if (field === 'total_mileage' || field === 'consumed_mileage') {
            const total = field === 'total_mileage' ? value : item.total_mileage;
            const consumed = field === 'consumed_mileage' ? value : item.consumed_mileage;
            
            if (total && consumed) {
                const diff = total - consumed;
                if (diff < -2000) {
                    showNotification('C-E差值不能小于-2000km', 'error');
                    input.value = oldValue;
                    return;
                }
                item.remaining_mileage = diff;
            }
        }
    }
    
    // 更新字段
    item[field] = value;
    
    // 如果是日期字段，更新相关字段
    if (field === 'entry_date' && value) {
        // 设置下次保养日期为一年后
        const nextService = new Date(value);
        nextService.setFullYear(nextService.getFullYear() + 1);
        item.next_service = nextService.toISOString().split('T')[0];
        
        // 找到并更新界面上的对应字段
        const row = input.closest('tr');
        if (row) {
            const nextServiceInput = row.querySelector('input[data-field="next_service"]');
            if (nextServiceInput) nextServiceInput.value = formatDateForInput(item.next_service);
        }
    }
    
    // 保存到云端或本地
    const isNew = !item.id;
    await saveBlackOilRow(item, isNew);
}

// ========== 工具函数 ==========

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'}; 
                    color: white; padding: 15px 20px; border-radius: 5px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 获取黑油行颜色
function getBlackOilRowColor(remaining, updateDate) {
    if (!remaining) return null;
    
    if (remaining <= 500) return 'rgba(234, 67, 53, 0.1)';
    if (remaining <= 1000) return 'rgba(251, 188, 4, 0.1)';
    
    // 检查是否超过3天未更新
    if (updateDate) {
        const update = new Date(updateDate);
        const today = new Date();
        const diffDays = Math.floor((today - update) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 3) return 'rgba(0, 188, 212, 0.1)';
    }
    
    return null;
}

// 获取状态类
function getRemainingStatusClass(remaining, type) {
    if (type === 'black') {
        if (remaining <= 500) return 'status-danger';
        if (remaining <= 1000) return 'status-warning';
        return 'status-safe';
    } else {
        if (remaining <= 5000) return 'status-danger';
        if (remaining <= 10000) return 'status-warning';
        return 'status-safe';
    }
}

// 格式化日期为输入框格式
function formatDateForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

// 验证里程
function validateMileage(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
}

// 更新通知徽章
function updateNotificationBadge() {
    // 简化版，实际应该计算警报数量
    const badge = document.getElementById('notificationCount');
    if (badge) {
        const count = Math.floor(Math.random() * 5); // 模拟数量
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// ========== 事件监听器 ==========

function initEventListeners() {
    // 添加黑油行按钮
    const addBlackOilBtn = document.getElementById('addBlackOilRow');
    if (addBlackOilBtn) {
        addBlackOilBtn.addEventListener('click', addBlackOilRow);
    }
    
    // 检查警报按钮
    const checkAlertsBtn = document.getElementById('checkBlackOilAlerts');
    if (checkAlertsBtn) {
        checkAlertsBtn.addEventListener('click', checkBlackOilAlerts);
    }
    
    // 导出按钮
    const exportBtn = document.getElementById('exportBlackOil');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportBlackOilData);
    }
    
    // 通知铃铛
    const notificationBell = document.getElementById('notificationBell');
    if (notificationBell) {
        notificationBell.addEventListener('click', showNotificationsModal);
    }
}

// 添加黑油行
function addBlackOilRow() {
    const newRow = {
        tempId: Date.now(), // 临时ID
        plate_number: '',
        next_service: new Date().toISOString().split('T')[0],
        total_mileage: 0,
        entry_date: new Date().toISOString().split('T')[0],
        consumed_mileage: 0,
        update_date: new Date().toISOString().split('T')[0],
        remaining_mileage: 0
    };
    
    blackOilData.unshift(newRow);
    initBlackOilTable();
    showNotification('已添加新行，请填写数据', 'info');
}

// 检查黑油警报
function checkBlackOilAlerts() {
    let alertCount = 0;
    let alertMessage = '黑油检查结果:\n\n';
    
    blackOilData.forEach(item => {
        const remaining = item.remaining_mileage || 0;
        
        if (remaining <= 500) {
            alertCount++;
            alertMessage += `⚠️ 车牌 ${item.plate_number || '未命名'}: 剩余${remaining}km，需要立即更换！\n`;
        } else if (remaining <= 1000) {
            alertCount++;
            alertMessage += `⚠️ 车牌 ${item.plate_number || '未命名'}: 剩余${remaining}km，建议近期更换\n`;
        }
    });
    
    if (alertCount === 0) {
        alertMessage += '✅ 所有车辆黑油状态正常';
    }
    
    alert(alertMessage);
    showNotification(`发现${alertCount}个黑油警报`, alertCount > 0 ? 'warning' : 'success');
}

// 导出黑油数据
function exportBlackOilData() {
    const dataStr = JSON.stringify(blackOilData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', `black-oil-data-${new Date().toISOString().split('T')[0]}.json`);
    link.click();
    
    showNotification('数据已导出为JSON文件', 'success');
}

// 显示通知模态框
function showNotificationsModal() {
    // 简化版，实际应该显示所有通知
    const modal = document.getElementById('notificationModal');
    const content = document.getElementById('notificationContent');
    
    if (modal && content) {
        content.innerHTML = `
            <h4><i class="fas fa-bell"></i> 系统通知</h4>
            <p>当前有 <strong>3</strong> 条未读通知：</p>
            <ul style="margin: 15px 0; padding-left: 20px;">
                <li>车牌 QM8517L 黑油剩余不足500km</li>
                <li>车牌 QAA2805W 齿轮油需要更换</li>
                <li>3辆车超过3天未更新数据</li>
            </ul>
            <p>请及时处理。</p>
        `;
        
        modal.style.display = 'flex';
    }
}

// 模拟数据（用于测试）
function loadMockData() {
    blackOilData = getMockBlackOilData();
    gearOilData = getMockGearOilData();
    predictionData = getMockPredictionData();
    
    initBlackOilTable();
    initGearOilTable();
    initPredictionTable();
    
    showNotification('已加载模拟数据', 'info');
}

function getMockBlackOilData() {
    return [
        {
            id: 1,
            plate_number: 'QM8517L',
            next_service: '2024-05-15',
            total_mileage: 85000,
            entry_date: '2023-05-15',
            consumed_mileage: 82000,
            update_date: '2023-11-20',
            remaining_mileage: 3000
        },
        {
            id: 2,
            plate_number: 'QAA2805W',
            next_service: '2024-03-10',
            total_mileage: 120000,
            entry_date: '2023-03-10',
            consumed_mileage: 118000,
            update_date: '2023-10-25',
            remaining_mileage: 2000
        }
    ];
}

// 注意：这里只提供了完整代码的一部分，实际还需要齿轮油和预测表的初始化函数
// 由于代码长度限制，请按照相同模式补充完整

console.log('app.js已加载 - 车辆油品管理系统');