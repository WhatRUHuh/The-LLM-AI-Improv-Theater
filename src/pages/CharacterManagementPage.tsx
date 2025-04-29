import React, { useState, useEffect } from 'react';
// 导入 theme 用于获取背景色等 token
import { Table, Button, message, Popconfirm, theme } from 'antd'; // 移除了 Tag
import { useNavigate } from 'react-router-dom';
import { AICharacter } from '../types';

// columns 的 handleDelete 现在需要传入角色 ID
const columns = (
  handleDelete: (id: string) => void, // <-- 改回接收 id
  navigateToEdit: (id: string) => void
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
          title={`确定删除角色 "${record.name}" 吗？`}
          onConfirm={() => handleDelete(record.id)} // <-- 传入 id
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger>删除</Button>
        </Popconfirm>
      </span>
    ),
  },
];

const CharacterManagementPage: React.FC = () => {
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate(); // 获取导航函数
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  // 移除 Modal 相关的状态和 Form hook
  // const [isModalVisible, setIsModalVisible] = useState(false);
  // const [editingRole, setEditingRole] = useState<AICharacter | null>(null);
  // const [form] = Form.useForm();

  // const rolesFileName = 'characters.json'; // 不再需要这个

  // 加载角色数据 - 使用新的 listCharacters API
  const loadCharacters = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.listCharacters();
      if (result.success && Array.isArray(result.data)) {
        console.log('[CharacterManagementPage] Loaded characters raw:', result.data.length);
        // 在设置状态前过滤重复 ID
        const uniqueCharacters = result.data.reduce((acc: AICharacter[], current) => {
          if (!acc.some(char => char.id === current.id)) {
            acc.push(current);
          } else {
            console.warn(`[CharacterManagementPage] Found duplicate character ID, skipping: ${current.id} (${current.name})`);
          }
          return acc;
        }, []);
        console.log('[CharacterManagementPage] Setting unique characters:', uniqueCharacters.length);
        setCharacters(uniqueCharacters);
      } else {
        message.error(`加载角色列表失败: ${result.error || '未知错误'}`);
        setCharacters([]);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 listCharacters 时出错: ${errorMsg}`);
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  // 不再需要 saveCharacters 函数，因为列表页不负责批量保存
  // 保存操作由编辑/添加页面通过 saveCharacter API 完成
  // const saveCharacters = async (updatedCharacters: AICharacter[]) => { ... };

  // 组件加载时读取数据 (逻辑不变)
  useEffect(() => {
    loadCharacters();
  }, []);

  // 移除 showModal, handleOk, handleCancel 函数

  // 跳转到添加页面
  const navigateToAdd = () => {
    navigate('/characters/add');
  };

  // 跳转到编辑页面
  const navigateToEdit = (id: string) => {
    navigate(`/characters/edit/${id}`);
  };

  // 处理删除 - 使用新的 deleteCharacter API，传入角色 ID
  const handleDelete = async (id: string) => { // <-- 改回接收 id
    const characterToDelete = characters.find(c => c.id === id); // 找到角色用于显示名字
    const characterName = characterToDelete ? characterToDelete.name : `ID: ${id}`;
    console.log(`[CharacterManagementPage] Attempting to delete character: ${characterName} (ID: ${id})`);
    try {
      const result = await window.electronAPI.deleteCharacter(id); // <-- 传递 id
      if (result.success) {
        message.success(`角色 "${characterName}" 已删除`);
        // 删除成功后重新加载列表
        loadCharacters();
      } else {
        message.error(`删除角色 "${characterName}" 失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 deleteCharacter 时出错: ${errorMsg}`);
    } // <-- 补上这个丢失的括号！哼！
  };

  return (
    // 1. 添加外部 div，负责滚动和左侧 5px 灰色边距
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      {/* 2. 给内部容器加上背景、圆角和内边距 */}
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        {/* 点击按钮跳转到添加页面 */}
        <Button type="primary" onClick={navigateToAdd} style={{ marginBottom: 16 }}>
        添加角色
      </Button>
      <Table
        columns={columns(handleDelete, navigateToEdit)} // 传入删除和导航到编辑页的函数
        dataSource={characters}
        loading={loading}
        rowKey="id"
        pagination={false}
      />
      {/* Modal 已移除 */}
      </div>
    </div> // 闭合外部 div
  );
};

export default CharacterManagementPage;