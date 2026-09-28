"""Loopback-only, key-authenticated SFTP integration fixture; no host accounts changed."""
import os, socket, sys, threading
from pathlib import Path
import paramiko

root=Path(sys.argv[1]).resolve()
host=paramiko.Ed25519Key.from_private_key_file(str(root/'host'))
authorized=(root/'identity.pub').read_text().split()[1]

class Auth(paramiko.ServerInterface):
    def check_auth_publickey(self, username, key):
        return paramiko.AUTH_SUCCESSFUL if key.get_base64()==authorized else paramiko.AUTH_FAILED
    def get_allowed_auths(self, username): return 'publickey'
    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED if kind=='session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

class Files(paramiko.SFTPServerInterface):
    def path(self, name):
        p=Path(name).resolve()
        if not p.is_relative_to(root):raise PermissionError(name)
        return p
    def stat(self, name):
        try:return paramiko.SFTPAttributes.from_stat(self.path(name).stat())
        except OSError as e:return paramiko.SFTPServer.convert_errno(e.errno)
    lstat=stat
    def open(self, name, flags, attr):
        try:
            fd=os.open(self.path(name),flags,0o600)
            f=os.fdopen(fd,'r+b' if flags&os.O_RDWR else 'wb' if flags&os.O_WRONLY else 'rb')
            h=paramiko.SFTPHandle(flags);h.readfile=f;h.writefile=f;return h
        except OSError as e:return paramiko.SFTPServer.convert_errno(e.errno)
    def rename(self, old, new):
        try:os.replace(self.path(old),self.path(new));return paramiko.SFTP_OK
        except OSError as e:return paramiko.SFTPServer.convert_errno(e.errno)

def serve(client):
    transport=paramiko.Transport(client)
    try:
        transport.add_server_key(host)
        transport.set_subsystem_handler('sftp',paramiko.SFTPServer,Files)
        transport.start_server(server=Auth())
        transport.join()
    except (EOFError,paramiko.SSHException):pass
    finally:transport.close()

sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen()
print(sock.getsockname()[1],flush=True)
while True:threading.Thread(target=serve,args=(sock.accept()[0],),daemon=True).start()
