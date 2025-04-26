import React, { useState, useEffect } from 'react';
// 移除 Modal, Form, Input, Select, uuidv4 的导入
import { Table, Button, message, Popconfirm, Tag } from 'antd';
import { useNavigate } from 'react-router-dom'; // 导入 useNavigate
import { Script, AICharacter } from '../types';
// uuid 不再需要
// import { v4 as uuidv4 } from 'uuid';

// columns 不再需要 handleEdit 函数，改为 navigateToEdit
const columns = (
  roles: AICharacter[],
  handleDelete: (id: string) => void,
  navigateToEdit: (id: string) => void // 新增导航到编辑页的函数
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
        {/* 点击编辑按钮时调用 navigateToEdit */}
        <Button type="link" onClick={() => navigateToEdit(record.id)}>编辑</Button>
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
  const [allRoles, setAllRoles] = useState<AICharacter[]>([]); // 仍然需要角色列表来显示名字
  const navigate = useNavigate(); // 获取导航函数

  // 移除 Modal 相关的状态和 Form hook
  // const [isModalVisible, setIsModalVisible] = useState(false);
  // const [editingScript, setEditingScript] = useState<Script | null>(null);
  // const [form] = Form.useForm();

  const scriptsFileName = 'scripts.json';
  const rolesFileName = 'roles.json';

  // 加载所有角色数据 (逻辑不变)
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

  // 组件加载时读取剧本和角色数据 (逻辑不变)
  useEffect(() => {
    loadScripts();
    loadAllRoles();
  }, []);

  // 移除 showModal, handleOk, handleCancel 函数

  // 跳转到添加页面
  const navigateToAdd = () => {
    navigate('/scripts/add');
  };

  // 跳转到编辑页面
  const navigateToEdit = (id: string) => {
    navigate(`/scripts/edit/${id}`);
  };

  // 处理删除 (逻辑不变)
  const handleDelete = (id: string) => {
    const updatedScripts = scripts.filter(script => script.id !== id);
    saveScripts(updatedScripts);
    message.success('剧本已删除');
  };

  return (
    <div>
      {/* 点击按钮跳转到添加页面 */}
      <Button type="primary" onClick={navigateToAdd} style={{ marginBottom: 16 }}>
        添加剧本
      </Button>
      <Table
        columns={columns(allRoles, handleDelete, navigateToEdit)} // 传入角色列表、删除和导航函数
        dataSource={scripts}
        loading={loading || !allRoles.length} // 角色列表加载中也显示 loading
        rowKey="id"
        pagination={false}
      />
      {/* Modal 已移除 */}
    </div>
  );
};

export default ScriptManagementPage;