const plannedSection = (title) => ({
    id: 'planned',
    title,
    description: '本 Iteration 仅提供设置结构，功能将在对应后续 Iteration 实现。',
});

export const SETTINGS_NAVIGATION = Object.freeze([
    {
        id: 'basic',
        label: '基础',
        tabs: [
            { id: 'general', label: '常规', sections: [plannedSection('Core 状态')] },
            { id: 'appearance', label: '外观', sections: [plannedSection('主题')] },
            { id: 'data', label: '数据', sections: [plannedSection('数据兼容')] },
        ],
    },
    {
        id: 'upload',
        label: '上传助手',
        tabs: [
            { id: 'combination', label: '组合预设', sections: [plannedSection('Combination Preset')] },
            { id: 'text', label: '标题 / 描述', sections: [plannedSection('Title / Description Preset')] },
            { id: 'discovery', label: '发现标签', sections: [plannedSection('Discovery Preset')] },
            { id: 'search-tags', label: '搜索标签', sections: [plannedSection('Search Tag Preset')] },
            { id: 'interface', label: '界面设置', sections: [plannedSection('上传界面')] },
        ],
    },
    { id: 'orders', label: '订单助手', tabs: [{ id: 'overview', label: '概览', sections: [plannedSection('订单助手')] }] },
    { id: 'chat', label: '聊天助手', tabs: [{ id: 'overview', label: '概览', sections: [plannedSection('聊天助手')] }] },
    { id: 'reviews', label: '评价助手', tabs: [{ id: 'overview', label: '概览', sections: [plannedSection('评价助手')] }] },
    { id: 'clients', label: '常用访问', tabs: [{ id: 'overview', label: '概览', sections: [plannedSection('常用访问')] }] },
    { id: 'developer', label: '开发者', tabs: [{ id: 'overview', label: '概览', sections: [plannedSection('Diagnostics')] }] },
]);
