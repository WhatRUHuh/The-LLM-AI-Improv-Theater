import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm } from 'antd';
import { AICharacter } from '../types'; // 导入角色类型
import { v4 as uuidv4 } from 'uuid'; // 用于生成唯一 ID

// 定义表格列
const columns = (handleDelete: (id: string) => void, handleEdit: (record: AICharacter) => void) => [
  // 可以考虑添加头像列，暂时先不加，避免复杂化
  // {
  //   title: '头像',
  //   dataIndex: 'avatar',
  //   key: 'avatar',
  //   render: (avatar: string | undefined) => avatar ? <Avatar src={avatar} /> : <Avatar>?</Avatar> // 需要导入 Avatar
  // },
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '性格描述',
    dataIndex: 'personality',
    key: 'personality',
    ellipsis: true, // 长文本省略
  },
  // 暂时不在表格中显示所有新字段，保持简洁
  // {
  //   title: '背景故事',
  //   dataIndex: 'background',
  //   key: 'background',
  //   ellipsis: true,
  //   render: (text: string | undefined) => text ? '已设置' : '未设置',
  // },
  // ... 其他新字段的列定义可以按需添加 ...
  {
    title: '操作',
    key: 'action',
    // 将第一个参数类型从 any 改为 unknown
    render: (_: unknown, record: AICharacter) => (
      <span>
        <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
        <Popconfirm
          title="确定删除这个角色吗？"
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

const RoleManagementPage: React.FC = () => {
  const [roles, setRoles] = useState<AICharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<AICharacter | null>(null); // 用于编辑
  const [form] = Form.useForm(); // AntD 表单 hook

  const rolesFileName = 'roles.json'; // 定义存储文件名

  // 加载角色数据
  const loadRoles = async () => {
    setLoading(true);
    try {
      // 注意：window.electronAPI 是在 preload.ts 中暴露的
      const result = await window.electronAPI.readStore(rolesFileName, [] as AICharacter[]);
      if (result.success && Array.isArray(result.data)) {
        setRoles(result.data);
      } else {
        message.error(`加载角色失败: ${result.error || '未知错误'}`);
        setRoles([]); // 出错时清空
      }
    } catch (error) {
      message.error(`调用读取存储时出错: ${error}`);
      setRoles([]); // 出错时清空
    } finally {
      setLoading(false);
    }
  };

  // 保存角色数据
  const saveRoles = async (updatedRoles: AICharacter[]) => {
    console.log('[RoleManagementPage] Attempting to save roles:', updatedRoles); // <-- 添加日志
    try {
      // 调用后台写入存储
      const result = await window.electronAPI.writeStore(rolesFileName, updatedRoles);
      console.log('[RoleManagementPage] writeStore result:', result); // <-- 添加日志
      if (!result.success) {
        message.error(`保存角色失败: ${result.error || '未知错误'}`);
      } else {
       // message.success('角色已保存'); // 可以选择性提示
       setRoles(updatedRoles); // 更新本地状态
      }
    } catch (error) {
      console.error('[RoleManagementPage] Error calling writeStore:', error); // <-- 修改为 console.error
      message.error(`调用写入存储时出错: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 组件加载时读取数据
  useEffect(() => {
    loadRoles();
  }, []);

  // 显示模态框 (添加或编辑)
  const showModal = (role: AICharacter | null = null) => {
    setEditingRole(role); // 设置正在编辑的角色，null 表示添加
    form.resetFields(); // 重置表单
    if (role) {
      form.setFieldsValue(role); // 如果是编辑，填充表单
    }
    setIsModalVisible(true);
  };

  // 处理模态框确认
  const handleOk = async () => {
    console.log('[RoleManagementPage] handleOk triggered'); // <-- 添加日志
    try {
      const values = await form.validateFields();
      console.log('[RoleManagementPage] Form values:', values); // <-- 添加日志
      let updatedRoles: AICharacter[];

      if (editingRole) {
        // 编辑模式
        updatedRoles = roles.map(role =>
          role.id === editingRole.id ? { ...role, ...values } : role
        );
      } else {
        // 添加模式
        const newRole: AICharacter = {
          id: uuidv4(), // 生成唯一 ID
          ...values,
        };
        updatedRoles = [...roles, newRole];
      }

      console.log('[RoleManagementPage] Calling saveRoles...'); // <-- 添加日志
      await saveRoles(updatedRoles); // 保存更新后的列表
      console.log('[RoleManagementPage] saveRoles finished.'); // <-- 添加日志
      setIsModalVisible(false);
      setEditingRole(null); // 清除编辑状态
      message.success(editingRole ? '角色已更新' : '角色已添加');

    } catch (info) {
      console.log('表单验证失败:', info);
    }
  };

  // 处理模态框取消
  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingRole(null);
  };

  // 处理删除
  const handleDelete = (id: string) => {
    const updatedRoles = roles.filter(role => role.id !== id);
    saveRoles(updatedRoles);
    message.success('角色已删除');
  };

  return (
    <div>
      <Button type="primary" onClick={() => showModal()} style={{ marginBottom: 16 }}>
        添加角色
      </Button>
      <Table
        columns={columns(handleDelete, showModal)} // 传入删除和编辑的处理函数
        dataSource={roles}
        loading={loading}
        rowKey="id" // 指定唯一标识符
        pagination={false} // 简单起见，暂时不分页
      />

      <Modal
        title={editingRole ? "编辑角色" : "添加新角色"}
        open={isModalVisible} // <-- 将 visible 改为 open
        onOk={handleOk}
        onCancel={handleCancel}
        okText="确定"
        cancelText="取消"
        destroyOnClose // 关闭时销毁内部元素，确保表单状态正确
      >
        {/* 将 useForm 创建的 form 实例传递给 Form 组件 */}
        <Form form={form} layout="vertical" name="role_form" initialValues={{ gender: '未知' }}> {/* 可以给性别等设置默认值 */}
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入角色姓名!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="identity"
            label="身份 (可选)"
          >
            <Input placeholder="例如：皇帝、密探、游侠..." />
          </Form.Item>
          <Form.Item
            name="gender"
            label="性别 (可选)"
          >
            {/* 可以用 Select 组件提供选项，这里用 Input 简化 */}
            <Input placeholder="例如：男、女、未知..." />
          </Form.Item>
          <Form.Item
            name="age"
            label="年龄 (可选)"
          >
            <Input placeholder="例如：25、青年、老年..." />
          </Form.Item>
          <Form.Item
            name="personality"
            label="性格"
            rules={[{ required: true, message: '请输入性格描述!' }]}
          >
            <Input.TextArea rows={3} placeholder="角色的核心性格特点..." />
          </Form.Item>
          <Form.Item
            name="background"
            label="背景故事 (可选)"
          >
            <Input.TextArea rows={3} placeholder="角色的过往经历、出身等..." />
          </Form.Item>
          <Form.Item
            name="appearance"
            label="外貌描述 (可选)"
          >
            <Input.TextArea rows={2} placeholder="角色的外貌特征..." />
          </Form.Item>
          <Form.Item
            name="abilities"
            label="能力/特长 (可选)"
          >
            <Input.TextArea rows={2} placeholder="角色擅长什么..." />
          </Form.Item>
          <Form.Item
            name="goals"
            label="目标/动机 (可选)"
          >
            <Input.TextArea rows={2} placeholder="角色想要达成什么..." />
          </Form.Item>
          <Form.Item
            name="secrets"
            label="秘密 (可选)"
          >
            <Input.TextArea rows={2} placeholder="角色隐藏的事情..." />
          </Form.Item>
          <Form.Item
            name="relationships"
            label="人物关系 (可选)"
          >
            <Input.TextArea rows={2} placeholder="与其他角色的关系描述..." />
          </Form.Item>
          {/* --- 额外 4 项 --- */}
          <Form.Item
            name="mannerisms"
            label="言行举止/小动作 (可选)"
          >
            <Input.TextArea rows={2} placeholder="角色的习惯性动作、说话方式等..." />
          </Form.Item>
          <Form.Item
            name="voiceTone"
            label="说话音调/风格 (可选)"
          >
            <Input placeholder="例如：低沉、沙哑、尖锐、温柔..." />
          </Form.Item>
          <Form.Item
            name="catchphrase"
            label="口头禅 (可选)"
          >
            <Input placeholder="角色经常说的话..." />
          </Form.Item>
          <Form.Item
            name="notes"
            label="其他备注 (可选)"
          >
            <Input.TextArea rows={3} placeholder="任何其他需要记录的信息..." />
          </Form.Item>
           <Form.Item name="avatar" label="头像 (URL 或标识符, 可选)">
            <Input placeholder="例如：/avatars/emperor.png 或 https://..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RoleManagementPage;