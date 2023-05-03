import "./App.css";
import "@blocksuite/editor/themes/affine.css";

import { createIndexedDBProvider } from "@toeverything/y-indexeddb";
import { EditorContainer } from "@blocksuite/editor";
import { Workspace, assertExists } from "@blocksuite/store";
import { AffineSchemas } from "@blocksuite/blocks/models";
import { useEffect, useRef } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";

const workspaceIdsAtom = atomWithStorage<string[]>("workspace", []);

workspaceIdsAtom.onMount = (set) => {
  if (localStorage.getItem("workspace") === null) {
    set(["demo-workspace"]);
  }
};

const currentWorkspaceIdAtom = atom<string | null>(null);

class WorkspaceMap extends Map<string, Workspace> {
  #lastWorkspaceId: string | null = null;
  public providers: Map<string, ReturnType<typeof createIndexedDBProvider>> =
    new Map();

  override set(key: string, workspace: Workspace): this {
    const provider = createIndexedDBProvider(key, workspace.doc);
    this.providers.set(key, provider);
    provider.connect();

    provider.whenSynced.then(() => {
      if (workspace.isEmpty) {
        const page = workspace.createPage({
          id: "page0",
        });

        const pageBlockId = page.addBlock("affine:page", {
          title: new Text(),
        });

        page.addBlock("affine:surface", {}, null);
        const frameId = page.addBlock("affine:frame", {}, pageBlockId);
        page.addBlock("affine:paragraph", {}, frameId);
        page.resetHistory();
      } else {
        const page = workspace.getPage("page0");
        assertExists(page);
      }
    });
    this.#lastWorkspaceId = key;
    return super.set(key, workspace);
  }

  override get(key: string): Workspace | undefined {
    if (this.#lastWorkspaceId) {
      const lastWorkspace = super.get(this.#lastWorkspaceId);
      assertExists(lastWorkspace);
      const provider = this.providers.get(this.#lastWorkspaceId);
      assertExists(provider);
      provider.disconnect();
    }
    return super.get(key);
  }
}

const hashMap = new WorkspaceMap();

const currentWorkspaceAtom = atom<Workspace | null>((get) => {
  const id = get(currentWorkspaceIdAtom);
  if (!id) return null;
  let workspace = hashMap.get(id);
  if (!workspace) {
    workspace = new Workspace({ id });
    workspace.register(AffineSchemas);
    hashMap.set(id, workspace);
  }
  return workspace;
});

const editorAtom = atom<Promise<EditorContainer | null>>(async (get) => {
  const workspace = get(currentWorkspaceAtom);
  if (!workspace) {
    return null;
  }
  const editor = new EditorContainer();
  const provider = hashMap.providers.get(workspace.id);
  assertExists(provider);
  await provider.whenSynced;
  const page = workspace.getPage("page0");
  assertExists(page);
  editor.page = page;
  return editor;
});

function App() {
  const ref = useRef<HTMLDivElement>(null);

  const editor = useAtomValue(editorAtom); // 将外部数据接入到React组件里面
  const ids = useAtomValue(workspaceIdsAtom);
  const [currentId, setCurrentId] = useAtom(currentWorkspaceIdAtom);
  useEffect(() => {
    if (currentId === null && ids.length > 0) {
      setCurrentId(ids[0]);
    }
  }, [currentId, ids, setCurrentId]);

  const workspace = useAtomValue(currentWorkspaceAtom);
  useEffect(() => {
    if (ref.current) {
      if (!editor || !workspace) return;
      const div = ref.current;
      div.appendChild(editor);
      return () => {
        div.removeChild(editor);
      };
    }
  }, [editor, workspace]);
  return (
    <div>
      <div ref={ref} id="editor-container" />
    </div>
  );
}

export default App;
