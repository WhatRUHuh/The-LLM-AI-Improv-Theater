import React, { useState, useEffect } from 'react';
import { Table, Button, message, Popconfirm, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Script, AICharacter } from '../types';

// columns 的 handleDelete 现在需要传入剧本标题，而不是 ID
const columns = (
  characters: AICharacter[], // 仍然需要角色列表来显示名字
  handleDelete: (title: string) => void, // <-- 改为接收 title
  navigateToEdit: (id: string) => void
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
    dataIndex: 'characterIds',
    key: 'characterIds',
    render: (characterIds: string[] | undefined) => {
      if (!characterIds || characterIds.length === 0) return '-';
      const characterNames = characterIds.map(id => {
        const character = characters.find(r => r.id === id);
        return character ? character.name : `未知ID(${id.substring(0, 4)}...)`;
      }).slice(0, 3);

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
  {
    title: '操作',
    key: 'action',
    render: (_: unknown, record: Script) => (
      <span>
        <Button type="link" onClick={() => navigateToEdit(record.id)}>编辑</Button>
        <Popconfirm
          title={`确定删除剧本 "${record.title}" 吗？`} // 提示更明确
          onConfirm={() => handleDelete(record.title)} // <-- 传入 title
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
  const [loadingScripts, setLoadingScripts] = useState(false); // 区分剧本和角色的 loading
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [allCharacters, setAllCharacters] = useState<AICharacter[]>([]);
  const navigate = useNavigate();

  // const scriptsFileName = 'scripts.json'; // 不再需要
  // const rolesFileName = 'characters.json'; // 不再需要

  // 加载所有角色数据 - 使用新的 listCharacters API
  const loadAllCharacters = async () => {
    console.log('[ScriptManagementPage] Loading all characters...');
    setLoadingCharacters(true);
    try {
      const result = await window.electronAPI.listCharacters();
      if (result.success && Array.isArray(result.data)) {
        console.log('[ScriptManagementPage] Loaded characters:', result.data.length);
        setAllCharacters(result.data);
      } else {
        message.error(`加载角色列表失败: ${result.error || '未知错误'}`);
        setAllCharacters([]);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 listCharacters 时出错: ${errorMsg}`);
      setAllCharacters([]);
    } finally {
      setLoadingCharacters(false);
    }
  };

  // 加载剧本数据 - 使用新的 listScripts API
  const loadScripts = async () => {
    console.log('[ScriptManagementPage] Loading scripts...');
    setLoadingScripts(true);
    try {
      const result = await window.electronAPI.listScripts();
      if (result.success && Array.isArray(result.data)) {
         console.log('[ScriptManagementPage] Loaded scripts:', result.data.length);
        setScripts(result.data);
      } else {
        message.error(`加载剧本列表失败: ${result.error || '未知错误'}`);
        setScripts([]);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 listScripts 时出错: ${errorMsg}`);
      setScripts([]);
    } finally {
      setLoadingScripts(false);
    }
  };

  // 不再需要 saveScripts 函数，列表页不负责批量保存
  // const saveScripts = async (updatedScripts: Script[]) => { ... };

  // 组件加载时读取剧本和角色数据
  useEffect(() => {
    loadScripts();
    loadAllCharacters();
  }, []);

  // 跳转到添加页面
  const navigateToAdd = () => {
    navigate('/scripts/add');
  };

  // 跳转到编辑页面
  const navigateToEdit = (id: string) => {
    navigate(`/scripts/edit/${id}`);
  };

  // 处理删除 - 使用新的 deleteScript API，传入剧本标题
  const handleDelete = async (title: string) => {
    console.log(`[ScriptManagementPage] Attempting to delete script: ${title}`);
    try {
      const result = await window.electronAPI.deleteScript(title);
      if (result.success) {
        message.success(`剧本 "${title}" 已删除`);
        // 删除成功后重新加载列表
        loadScripts();
      } else {
        message.error(`删除剧本 "${title}" 失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用 deleteScript 时出错: ${errorMsg}`);
    }
  };

  return (
    <div>
      <Button type="primary" onClick={navigateToAdd} style={{ marginBottom: 16 }}>
        添加剧本
      </Button>
      <Table
        columns={columns(allCharacters, handleDelete, navigateToEdit)}
        dataSource={scripts}
        loading={loadingScripts || loadingCharacters} // 任何一个在加载都显示 loading
        rowKey="id"
        pagination={false}
      />
    </div>
  );
};

export default ScriptManagementPage;