import React, { useState, useEffect } from 'react';
// 增加 Select 组件导入
import { Table, Button, Modal, Form, Input, message, Popconfirm, Tag, Select } from 'antd';
// 同时导入 Script 和 AICharacter 类型
import { Script, AICharacter } from '../types';
import { v4 as uuidv4 } from 'uuid';

// 需要角色列表来查找名字，所以 columns 需要接收 roles 参数
const columns = (
  roles: AICharacter[], // 传入角色列表
  handleDelete: (id: string) => void,
  handleEdit: (record: Script) => void
) => [
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
  },
  {
    title: '场景',
    dataIndex: 'scene',
    key: 'scene',
    ellipsis: true,
  },
  {
    title: '角色',
    dataIndex: 'characterIds', // 改为使用 characterIds
    key: 'characterIds',
    render: (characterIds: string[] | undefined) => {
      if (!characterIds || characterIds.length === 0) return '-';
      // 根据 ID 查找角色名称
      const characterNames = characterIds.map(id => {
        const role = roles.find(r => r.id === id);
        return role ? role.name : `未知ID(${id.substring(0, 4)}...)`; // 如果找不到角色，显示未知
      }).slice(0, 3); // 最多显示3个

      return (
        <>
          {characterNames.map(name => (
            <Tag key={name}>{name}</Tag>
          ))}
          {characterIds.length > 3 && <Tag>...</Tag>}
        </>
      );
    },
  },
  // 导演指令列已移除
  {
    title: '操作',
    key: 'action',
    render: (_: unknown, record: Script) => (
      <span>
        <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
        <Popconfirm
          title="确定删除这个剧本吗？"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger>删除</Button>
        </Popconfirm>
      </span>
    ),
  },
];

const ScriptManagementPage: React.FC = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [form] = Form.useForm();
  const [allRoles, setAllRoles] = useState<AICharacter[]>([]); // 新增状态存储所有角色

  const scriptsFileName = 'scripts.json';
  const rolesFileName = 'roles.json'; // 角色文件名

  // 加载所有角色数据 (用于下拉选择和显示名字)
  const loadAllRoles = async () => {
    try {
      const result = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
      if (result.success && Array.isArray(result.data)) {
        setAllRoles(result.data);
      } else {
        message.error(`加载角色列表失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`调用读取角色存储时出错: ${error}`);
    }
  };

  // 加载剧本数据
  const loadScripts = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.readStore(scriptsFileName, [] as Script[]);
      if (result.success && Array.isArray(result.data)) {
        setScripts(result.data);
      } else {
        message.error(`加载剧本失败: ${result.error || '未知错误'}`);
        setScripts([]); // 出错时清空
      }
    } catch (error) {
      message.error(`调用读取存储时出错: ${error}`);
      setScripts([]); // 出错时清空
    } finally {
      setLoading(false);
    }
  };

  // 保存剧本数据
  const saveScripts = async (updatedScripts: Script[]) => {
    try {
      const result = await window.electronAPI.writeStore(scriptsFileName, updatedScripts);
      if (!result.success) {
        message.error(`保存剧本失败: ${result.error || '未知错误'}`);
      } else {
        setScripts(updatedScripts); // 更新本地状态
      }
    } catch (error) {
      message.error(`调用写入存储时出错: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 组件加载时读取剧本和角色数据
  useEffect(() => {
    loadScripts();
    loadAllRoles(); // 同时加载角色列表
  }, []);

  // 显示模态框 (添加或编辑)
  const showModal = (script: Script | null = null) => {
    setEditingScript(script);
    form.resetFields();
    if (script) {
      // 编辑时，直接设置 characterIds 给 Select 组件
      form.setFieldsValue({
        ...script,
        // directives 字段已移除
      });
    } else {
      // 添加时，确保 characterIds 字段存在且为空数组或 undefined
       form.setFieldsValue({ characterIds: [] });
    }
    setIsModalVisible(true);
  };

  // 处理模态框确认
  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      let updatedScripts: Script[];

      // 从表单获取选中的 characterIds (Select 组件直接返回 ID 数组)
      const selectedCharacterIds = values.characterIds || [];

      if (editingScript) {
        // 编辑模式
        updatedScripts = scripts.map(script =>
          script.id === editingScript.id ? {
            ...script,
            title: values.title, // 显式更新字段
            scene: values.scene,
            characterIds: selectedCharacterIds, // 使用选中的 ID 数组
            // directives 字段已移除
           } : script
        );
      } else {
        // 添加模式
        const newScript: Script = {
          id: uuidv4(),
          title: values.title,
          scene: values.scene,
          characterIds: selectedCharacterIds,
          // directives 字段已移除
        };
        updatedScripts = [...scripts, newScript];
      }

      await saveScripts(updatedScripts); // 保存更新后的列表
      setIsModalVisible(false);
      setEditingScript(null); // 清除编辑状态
      message.success(editingScript ? '剧本已更新' : '剧本已添加');

    } catch (info) {
      console.log('表单验证失败:', info);
    }
  };

  // 处理模态框取消
  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingScript(null);
  };

  // 处理删除
  const handleDelete = (id: string) => {
    const updatedScripts = scripts.filter(script => script.id !== id);
    saveScripts(updatedScripts);
    message.success('剧本已删除');
  };

  return (
    <div>
      <Button type="primary" onClick={() => showModal()} style={{ marginBottom: 16 }}>
        添加剧本
      </Button>
      <Table
        // 将加载的角色列表传递给 columns 函数
        columns={columns(allRoles, handleDelete, showModal)}
        dataSource={scripts}
        loading={loading || !allRoles} // 角色列表加载中也显示 loading
        rowKey="id"
        pagination={false}
      />

      <Modal
        title={editingScript ? "编辑剧本" : "添加新剧本"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="确定"
        cancelText="取消"
        destroyOnClose
        width={600} // 可以让模态框宽一点，方便编辑
      >
        <Form form={form} layout="vertical" name="script_form">
          <Form.Item
            name="title"
            label="剧本标题"
            rules={[{ required: true, message: '请输入剧本标题!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="scene"
            label="场景描述 (可选)"
          >
            <Input.TextArea rows={3} placeholder="描述故事发生的场景..." />
          </Form.Item>
          <Form.Item
            name="characterIds" // 改为 characterIds
            label="选择角色 (可选)"
          >
            {/* 使用 Select 组件进行多选 */}
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder="请选择参演角色"
              options={allRoles.map(role => ({ // 使用加载的角色列表生成选项
                label: role.name,
                value: role.id,
              }))}
              filterOption={(input, option) => // 添加搜索功能
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          {/* 导演指令输入框已移除 */}
        </Form>
      </Modal>
    </div>
  );
};

export default ScriptManagementPage;