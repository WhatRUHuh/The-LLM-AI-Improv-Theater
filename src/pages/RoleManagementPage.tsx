import React, { useState, useEffect } from 'react';
// 移除 Modal, Form, Input, uuidv4 的导入
import { Table, Button, message, Popconfirm } from 'antd'; // 移除了 Tag
import { useNavigate } from 'react-router-dom';
import { AICharacter } from '../types';

// columns 不再需要 handleEdit 函数，改为 navigateToEdit
const columns = (
  handleDelete: (id: string) => void,
  navigateToEdit: (id: string) => void // 新增导航到编辑页的函数
) => [
  // 头像列可以取消注释并添加 Avatar 导入
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
        {/* 点击编辑按钮时调用 navigateToEdit */}
        <Button type="link" onClick={() => navigateToEdit(record.id)}>编辑</Button>
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
  const navigate = useNavigate(); // 获取导航函数

  // 移除 Modal 相关的状态和 Form hook
  // const [isModalVisible, setIsModalVisible] = useState(false);
  // const [editingRole, setEditingRole] = useState<AICharacter | null>(null);
  // const [form] = Form.useForm();

  const rolesFileName = 'roles.json';

  // 加载角色数据 (逻辑不变)
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

  // 组件加载时读取数据 (逻辑不变)
  useEffect(() => {
    loadRoles();
  }, []);

  // 移除 showModal, handleOk, handleCancel 函数

  // 跳转到添加页面
  const navigateToAdd = () => {
    navigate('/roles/add');
  };

  // 跳转到编辑页面
  const navigateToEdit = (id: string) => {
    navigate(`/roles/edit/${id}`);
  };

  // 处理删除 (逻辑不变)
  const handleDelete = (id: string) => {
    const updatedRoles = roles.filter(role => role.id !== id);
    saveRoles(updatedRoles);
    message.success('角色已删除');
  };

  return (
    <div>
      {/* 点击按钮跳转到添加页面 */}
      <Button type="primary" onClick={navigateToAdd} style={{ marginBottom: 16 }}>
        添加角色
      </Button>
      <Table
        columns={columns(handleDelete, navigateToEdit)} // 传入删除和导航到编辑页的函数
        dataSource={roles}
        loading={loading}
        rowKey="id"
        pagination={false}
      />
      {/* Modal 已移除 */}
    </div>
  );
};

export default RoleManagementPage;