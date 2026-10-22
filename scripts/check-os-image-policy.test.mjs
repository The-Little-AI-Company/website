import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const checkout = read('scripts/checkout-ci.sh');
const literal = marker => checkout.split(`<<'${marker}'\n`)[1].split(`\n${marker}\n`)[0] + '\n';
const images = [literal('COMPANY_CHECKOUT_DOCKERFILE'), read('.github/actions/security-ci/Dockerfile'), read('.github/actions/runtime-handoff/Dockerfile')];
const entry = read('.github/actions/security-ci/entrypoint.sh');
const handoff = read('.github/actions/runtime-handoff/capture-runtime.sh');
const helper = literal('COMPANY_CHECKOUT_HELPER');
const floors = [['libc6','2.39-0ubuntu8.9'],['libc-bin','2.39-0ubuntu8.9'],['libssl3t64','3.0.13-0ubuntu3.16'],['openssl','3.0.13-0ubuntu3.16']];
function imagePolicy(image) {
  assert.match(image,/FROM docker\.io\/library\/ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517/);
  for (const part of ['http://archive.ubuntu.com/ubuntu','http://security.ubuntu.com/ubuntu','Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg','Acquire::AllowInsecureRepositories "false"','Acquire::AllowDowngradeToInsecureRepositories "false"','Acquire::Check-Valid-Until "true"','APT::Get::AllowUnauthenticated "false"','apt-get update --error-on=any','apt-mark hold ca-certificates','apt-get upgrade --with-new-pkgs --yes --no-install-recommends']) assert.ok(image.includes(part),part);
  assert.doesNotMatch(image,/--allow-unauthenticated|--allow-downgrades|trusted=yes|Check-Valid-Until "false"|apt-mark unhold|dist-upgrade|full-upgrade/);
  const download=image.indexOf('install --download-only');
  const check=image.indexOf('8a0a754aaafed72cc8efb8c1731808133284a84fbfc76a4fcc73fce9e01b4187');
  const install=image.indexOf('install --no-download');
  const upgrade=image.indexOf('apt-get upgrade');
  assert.ok(download>=0&&download<check&&check<install&&install<upgrade);
  const apt=[...image.matchAll(/^ && apt-get -o (\S+) install (--download-only|--no-download)(.+)$/gm)];
  assert.equal(apt.length,2);assert.equal(apt[0][1],apt[1][1]);assert.equal(apt[0][3],apt[1][3]);
  for(const [name,version] of floors){const guard=`dpkg --compare-versions "$(dpkg-query --show --showformat='\${Version}' ${name})" ge ${version}`;assert.ok(image.indexOf(guard)>upgrade,name);}
  assert.ok(image.indexOf("dpkg-query --show --showformat='${binary:Package}\\t${Version}\\t${Architecture}\\t${Status}\\n'")>upgrade);
  assert.ok(image.includes('test ! -L /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb'));
  assert.ok(image.includes('138884'));
}
function runtimePolicy(source,before) {
  const start=source.indexOf('# BEGIN COMPANY OS PACKAGE GUARD');const end=source.indexOf('# END COMPANY OS PACKAGE GUARD');
  assert.ok(start>=0&&end>start&&end<source.indexOf(before));
  for(const [name,version] of floors)assert.ok(source.includes(`assert_os_floor ${name} ${version}`));
  assert.ok(source.includes("test \"$status\" = 'install ok installed'"));
  assert.ok(source.includes('dpkg --compare-versions "$installed" ge "$minimum"'));
  assert.ok(source.includes("dpkg-query --show --showformat='${binary:Package}\\t${Version}\\t${Architecture}\\t${Status}\\n'"));
}
test('checkout, workload and handoff rebuild from signed official metadata before floor guards',()=>images.forEach(imagePolicy));
test('actual entrypoints check installed packages and emit full inventory before protected consumers',()=>{runtimePolicy(helper,'ca_version=');runtimePolicy(entry,'node /opt/company/check-node-version.mjs');runtimePolicy(handoff,'directory=$(readlink -f');});
test('missing upgrade, obsolete floor, insecure metadata and skipped CA identity fail',()=>{
  for(const [from,to] of [['apt-get upgrade --with-new-pkgs --yes --no-install-recommends','true'],['ge 3.0.13-0ubuntu3.16','ge 3.0.13-0ubuntu3.12'],['Acquire::Check-Valid-Until "true"','Acquire::Check-Valid-Until "false"'],['8a0a754aaafed72cc8efb8c1731808133284a84fbfc76a4fcc73fce9e01b4187','0'.repeat(64)]])assert.throws(()=>imagePolicy(images[0].replaceAll(from,to)));
});
test('runtime inventory or minimum guard removal fails',()=>{
  assert.throws(()=>runtimePolicy(entry.replace('assert_os_floor libc6 2.39-0ubuntu8.9','true'),'node /opt/company/check-node-version.mjs'));
  assert.throws(()=>runtimePolicy(entry.replace("${binary:Package}\\t${Version}\\t${Architecture}\\t${Status}\\n",'omitted'),'node /opt/company/check-node-version.mjs'));
});
