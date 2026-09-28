import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';
import { renderTextPresetManager } from './text-preset-settings.js';

export function createOrderTextPresetNavigation(engine, baseNavigation) {
    return baseNavigation.map((item) => item.id !== 'orders' ? item : {
        ...item,
        tabs: [{
            id: 'text-presets', label: '文本预设', sections: [
                { id: 'final-delivery', title: 'Final Delivery', description: '只填入，不交付。真实输入区等待安全订单状态验证。', render: renderTextPresetManager(engine, TEXT_PRESET_CONTEXTS.finalDelivery, { contentLabel: '交付文本' }) },
                { id: 'private-note', title: 'Private Note', description: '只填入 Note to self，不调用保存。', render: renderTextPresetManager(engine, TEXT_PRESET_CONTEXTS.privateNote, { contentLabel: 'Private Note' }) },
            ],
        }],
    });
}
